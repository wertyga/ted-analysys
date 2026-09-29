import { Injectable } from '@nestjs/common';
import { AnyBulkWriteOperation } from 'mongoose';
import {
  AwardTenderDocument,
  AwardTenderModel,
} from '@/resources/award-tender/schemas';
import {
  applyStickyAwardValueCorrections,
  AwardValueCorrection,
  extractLotWinnersFromXml,
  restoreOriginalAwardValues,
  sanitizeLotAwardValues,
  sanitizeTenderAwardValue,
  TenderValueRange,
} from '@/resources/award-tender/utils';
import { BuyerService } from '@/resources/buyer/buyer.service';
import { ContractorService } from '@/resources/contractor/contractor.service';

export type AwardValuesFixOptions = {
  // Only report what would change, don't write anything
  dryRun?: boolean;
  // Download TED XML to get tender value ranges for big awards
  refetchXml?: boolean;
  refetchMinAwardValueEur?: number;
};

export type AwardValuesFixSample = {
  id: string;
  before: number | null;
  after: number | null;
  rules: string[];
};

export type AwardValuesFixStatus = {
  isRunning: boolean;
  dryRun: boolean;
  refetchXml: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  total: number;
  processed: number;
  changedTenders: number;
  tendersWithCorrections: number;
  correctionsByRule: Record<string, number>;
  xmlRefetched: number;
  xmlFailed: number;
  buyersToRefresh: number;
  buyersRefreshed: number;
  contractorsToRefresh: number;
  contractorsRefreshed: number;
  // Biggest changes of the tender award value
  samples: AwardValuesFixSample[];
};

type Money = { amount: number | null; currency: string | null };

type StoredLot = {
  identifier?: string;
  awardValue?: Money | null;
  awardValueEur?: number | null;
  estimatedValueEur?: number | null;
  tenderValueRange?: TenderValueRange | null;
  winner?: unknown;
};

type StoredAwardTender = {
  id: string;
  awardValue?: Money | null;
  awardValueEur?: number | null;
  estimatedValueEur?: number | null;
  awardValueCorrections?: AwardValueCorrection[];
  lots?: StoredLot[];
  links?: AwardTenderDocument['links'];
  leadBuyers?: unknown[];
  nonLeadBuyers?: unknown[];
  winners?: unknown[];
};

const FIX_SELECT = [
  'id',
  'awardValue',
  'awardValueEur',
  'estimatedValueEur',
  'awardValueCorrections',
  'lots.identifier',
  'lots.awardValue',
  'lots.awardValueEur',
  'lots.estimatedValueEur',
  'lots.tenderValueRange',
  'lots.winner',
  'links',
  'leadBuyers',
  'nonLeadBuyers',
  'winners',
].join(' ');

const BULK_WRITE_SIZE = 500;
const REFRESH_CHUNK_SIZE = 20;
const MAX_SAMPLES = 200;
const XML_FETCH_DELAY_MS = 300;
const DEFAULT_REFETCH_MIN_AWARD_VALUE_EUR = 1_000_000_000;

const emptyStatus = (): AwardValuesFixStatus => ({
  isRunning: false,
  dryRun: true,
  refetchXml: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  total: 0,
  processed: 0,
  changedTenders: 0,
  tendersWithCorrections: 0,
  correctionsByRule: {},
  xmlRefetched: 0,
  xmlFailed: 0,
  buyersToRefresh: 0,
  buyersRefreshed: 0,
  contractorsToRefresh: 0,
  contractorsRefreshed: 0,
  samples: [],
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isSameMoney = (a?: Money | null, b?: Money | null) =>
  (a?.amount ?? null) === (b?.amount ?? null) &&
  (a?.currency ?? null) === (b?.currency ?? null);

const isSameRange = (
  a?: TenderValueRange | null,
  b?: TenderValueRange | null,
) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

@Injectable()
export class AwardValuesFixTechService {
  private status = emptyStatus();

  constructor(
    private readonly buyerService: BuyerService,
    private readonly contractorService: ContractorService,
  ) {}

  getStatus(): AwardValuesFixStatus {
    return { ...this.status };
  }

  start(options: AwardValuesFixOptions = {}): AwardValuesFixStatus {
    if (this.status.isRunning) {
      return this.getStatus();
    }

    this.status = {
      ...emptyStatus(),
      isRunning: true,
      dryRun: options.dryRun !== false,
      refetchXml: !!options.refetchXml,
      startedAt: new Date(),
    };

    void this.run(options);

    return this.getStatus();
  }

  private async run(options: AwardValuesFixOptions) {
    const status = this.status;
    const refetchMinAwardValueEur =
      Number(options.refetchMinAwardValueEur) ||
      DEFAULT_REFETCH_MIN_AWARD_VALUE_EUR;

    const buyerIds = new Set<string>();
    const contractorIds = new Set<string>();
    let operations: AnyBulkWriteOperation<AwardTenderDocument>[] = [];

    const flush = async () => {
      if (!status.dryRun && operations.length) {
        await AwardTenderModel.bulkWrite(operations, { ordered: false });
      }

      operations = [];
    };

    try {
      status.total = await AwardTenderModel.estimatedDocumentCount();

      const cursor = AwardTenderModel.find({})
        .select(FIX_SELECT)
        .lean()
        .cursor({ batchSize: 500 });

      for await (const doc of cursor) {
        const tender = doc as unknown as StoredAwardTender;
        status.processed += 1;

        const result = await this.fixTender(tender, {
          refetchXml: status.refetchXml,
          refetchMinAwardValueEur,
        });

        if (result.corrections.length) {
          status.tendersWithCorrections += 1;

          for (const correction of result.corrections) {
            status.correctionsByRule[correction.rule] =
              (status.correctionsByRule[correction.rule] ?? 0) + 1;
          }
        }

        if (!result.set) {
          continue;
        }

        status.changedTenders += 1;
        this.addSample(tender, result.set, result.corrections);

        [...(tender.leadBuyers ?? []), ...(tender.nonLeadBuyers ?? [])]
          .filter(Boolean)
          .forEach((id) => buyerIds.add(String(id)));
        [
          ...(tender.winners ?? []),
          ...(tender.lots ?? []).map((lot) => lot.winner),
        ]
          .filter(Boolean)
          .forEach((id) => contractorIds.add(String(id)));

        operations.push({
          updateOne: {
            filter: { id: tender.id },
            update: { $set: result.set },
          },
        });

        if (operations.length >= BULK_WRITE_SIZE) {
          await flush();
        }
      }

      await flush();

      status.buyersToRefresh = buyerIds.size;
      status.contractorsToRefresh = contractorIds.size;

      if (!status.dryRun) {
        await this.refreshInChunks([...buyerIds], async (ids) => {
          await this.buyerService.refreshBuyersTenderMeta(ids);
          status.buyersRefreshed += ids.length;
        });

        await this.refreshInChunks([...contractorIds], async (ids) => {
          await this.contractorService.refreshContractorsAwardMeta(ids);
          status.contractorsRefreshed += ids.length;
        });
      }
    } catch (error) {
      status.lastError =
        error instanceof Error ? error.message : 'Unknown error';
    } finally {
      status.samples = this.getTopSamples(status.samples);
      status.isRunning = false;
      status.finishedAt = new Date();
    }
  }

  private async fixTender(
    tender: StoredAwardTender,
    options: { refetchXml: boolean; refetchMinAwardValueEur: number },
  ): Promise<{
    set: Record<string, unknown> | null;
    corrections: AwardValueCorrection[];
  }> {
    const storedLots = tender.lots ?? [];

    // Start from the values published in TED, so re-runs are idempotent
    const restored = restoreOriginalAwardValues(
      {
        awardValue: tender.awardValue ?? { amount: null, currency: null },
        awardValueEur: tender.awardValueEur ?? null,
        estimatedValueEur: tender.estimatedValueEur ?? null,
        lots: storedLots,
      },
      tender.awardValueCorrections,
    );

    let lots = restored.lots;

    if (
      options.refetchXml &&
      this.needsTenderValueRange(
        restored.awardValueEur,
        lots,
        options.refetchMinAwardValueEur,
      )
    ) {
      lots = await this.attachTenderValueRanges(tender, lots);
    }

    const { lots: ruleLots, corrections: lotCorrections } =
      sanitizeLotAwardValues(lots);
    const { tender: ruleTender, corrections: tenderCorrections } =
      sanitizeTenderAwardValue(restored, ruleLots);
    const {
      tender: sanitizedTender,
      lots: sanitizedLots,
      corrections: stickyCorrections,
    } = applyStickyAwardValueCorrections(
      ruleTender,
      ruleLots,
      tender.awardValueCorrections,
    );
    const corrections = [
      ...lotCorrections,
      ...tenderCorrections,
      ...stickyCorrections,
    ];

    const set: Record<string, unknown> = {};

    if (
      !isSameMoney(sanitizedTender.awardValue, tender.awardValue) ||
      sanitizedTender.awardValueEur !== (tender.awardValueEur ?? null)
    ) {
      set.awardValue = sanitizedTender.awardValue;
      set.awardValueEur = sanitizedTender.awardValueEur;
    }

    sanitizedLots.forEach((lot, i) => {
      const storedLot = storedLots[i];

      if (
        !isSameMoney(lot.awardValue, storedLot?.awardValue) ||
        (lot.awardValueEur ?? null) !== (storedLot?.awardValueEur ?? null)
      ) {
        set[`lots.${i}.awardValue`] = lot.awardValue;
        set[`lots.${i}.awardValueEur`] = lot.awardValueEur ?? null;
      }

      if (!isSameRange(lot.tenderValueRange, storedLot?.tenderValueRange)) {
        set[`lots.${i}.tenderValueRange`] = lot.tenderValueRange ?? null;
      }
    });

    if (
      JSON.stringify(corrections) !==
      JSON.stringify(tender.awardValueCorrections ?? [])
    ) {
      set.awardValueCorrections = corrections;
    }

    return {
      set: Object.keys(set).length ? set : null,
      corrections,
    };
  }

  private needsTenderValueRange(
    awardValueEur: number | null,
    lots: StoredLot[],
    minAwardValueEur: number,
  ): boolean {
    if (!lots.length || lots.every((lot) => lot.tenderValueRange)) {
      return false;
    }

    return (
      (awardValueEur ?? 0) >= minAwardValueEur ||
      lots.some((lot) => (lot.awardValueEur ?? 0) >= minAwardValueEur)
    );
  }

  private async attachTenderValueRanges(
    tender: StoredAwardTender,
    lots: StoredLot[],
  ): Promise<StoredLot[]> {
    if (!tender.links) {
      return lots;
    }

    try {
      const xmlLots = await extractLotWinnersFromXml(tender.links);
      this.status.xmlRefetched += 1;

      return lots.map((lot) => {
        const range = xmlLots.find(
          (xmlLot) =>
            xmlLot.lotId === lot.identifier && xmlLot.tenderValueRange,
        )?.tenderValueRange;

        return range ? { ...lot, tenderValueRange: range } : lot;
      });
    } catch {
      this.status.xmlFailed += 1;

      return lots;
    } finally {
      await sleep(XML_FETCH_DELAY_MS);
    }
  }

  private addSample(
    tender: StoredAwardTender,
    set: Record<string, unknown>,
    corrections: AwardValueCorrection[],
  ) {
    const samples = this.status.samples;

    samples.push({
      id: tender.id,
      before: tender.awardValueEur ?? null,
      after:
        'awardValueEur' in set
          ? (set.awardValueEur as number | null)
          : (tender.awardValueEur ?? null),
      rules: [...new Set(corrections.map((c) => `${c.scope}:${c.rule}`))],
    });

    if (samples.length > MAX_SAMPLES * 2) {
      this.status.samples = this.getTopSamples(samples);
    }
  }

  private getTopSamples(samples: AwardValuesFixSample[]) {
    const delta = (s: AwardValuesFixSample) =>
      Math.abs((s.before ?? 0) - (s.after ?? 0));

    return [...samples]
      .sort((a, b) => delta(b) - delta(a))
      .slice(0, MAX_SAMPLES);
  }

  private async refreshInChunks(
    ids: string[],
    refresh: (ids: string[]) => Promise<void>,
  ) {
    for (let i = 0; i < ids.length; i += REFRESH_CHUNK_SIZE) {
      await refresh(ids.slice(i, i + REFRESH_CHUNK_SIZE));
    }
  }
}
