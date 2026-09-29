import { Injectable, Logger } from '@nestjs/common';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import {
  AwardPriceFinding,
  AwardPriceSearchResult,
  AwardTenderModel,
  AwardValueReview,
  AwardValueReviewChange,
  AwardValueReviewDocument,
  AwardValueReviewModel,
  AwardValueReviewMoney,
  AwardValueReviewStatus,
} from '@/resources/award-tender/schemas';
import { AwardValueCorrection } from '@/resources/award-tender/utils';
import { BuyerModel } from '@/resources/buyer/schemas';
import { BuyerService } from '@/resources/buyer/buyer.service';
import { ContractorModel } from '@/resources/contractor/schemas';
import { ContractorService } from '@/resources/contractor/contractor.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { getSafeErrorMessage, isRecord } from '@/utils';
import { AwardPriceSearchService } from './award-price-search.service';

export type AwardValueReviewOptions = {
  minAwardValueEur?: number;
  // Max tenders per run, all candidates when empty
  limit?: number;
  // Review again tenders that were not applied or rejected yet
  recheck?: boolean;
};

export type AwardValueReviewRunStatus = {
  isRunning: boolean;
  stopRequested: boolean;
  minAwardValueEur: number;
  webSearchEnabled: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  total: number;
  processed: number;
  flagged: number;
  noChange: number;
  failed: number;
  // Tenders where the web search found a verified price
  withWebPrice: number;
  // Same errors are grouped, so a Brave quota error shows up once with a count
  errors: AwardValueReviewRunError[];
};

export type AwardValueReviewRunError = {
  stage: 'search' | 'fetch' | 'llm' | 'review';
  message: string;
  count: number;
  // Query, url or tender id of the first occurrence
  example: string;
};

type Money = { amount?: number | null; currency?: string | null };

type StoredLot = {
  identifier?: string;
  title?: string;
  awardValue?: Money | null;
  awardValueEur?: number | null;
  estimatedValueEur?: number | null;
  tenderValueRange?: unknown;
  winner?: unknown;
};

type StoredAwardTender = {
  _id: string;
  id: string;
  title?: string;
  titleProc?: string;
  description?: string;
  cpvCodes?: string[];
  contractNature?: string;
  procedureType?: string;
  isFrameworkAgreement?: boolean;
  publicationDate?: Date;
  placeOfPerformanceCountries?: string[];
  awardValue?: Money | null;
  awardValueEur?: number | null;
  estimatedValue?: Money | null;
  estimatedValueEur?: number | null;
  awardValueCorrections?: AwardValueCorrection[];
  lots?: StoredLot[];
  leadBuyers?: unknown[];
  nonLeadBuyers?: unknown[];
  winners?: unknown[];
};

type LlmVerdict = {
  verdict: 'plausible' | 'shifted' | 'invalid' | 'replaced';
  factor: number | null;
  finding: AwardPriceFinding | null;
  reason: string;
};

type BuyerContext = {
  name: string;
  country: string | null;
  otherAwardsCount: number;
  typicalAwardEur: number | null;
  recentAwards: { title?: string; eur: number | null | undefined }[];
};

const DEFAULT_MIN_AWARD_VALUE_EUR = 100_000_000;
const CONCURRENCY = 3;
const MAX_LOTS_IN_PROMPT = 30;
const MAX_WINNERS = 5;
const MAX_DESCRIPTION_LENGTH = 1500;
const BUYER_HISTORY_LIMIT = 100;
const BUYER_SAMPLES = 8;
const SHIFT_FACTORS = [10, 100, 1000];
const REFRESH_CHUNK_SIZE = 20;
const MAX_RUN_ERRORS = 20;

const REVIEW_SELECT = [
  '_id',
  'id',
  'title',
  'titleProc',
  'description',
  'cpvCodes',
  'contractNature',
  'procedureType',
  'isFrameworkAgreement',
  'publicationDate',
  'placeOfPerformanceCountries',
  'awardValue',
  'awardValueEur',
  'estimatedValue',
  'estimatedValueEur',
  'awardValueCorrections',
  'lots.identifier',
  'lots.title',
  'lots.awardValue',
  'lots.awardValueEur',
  'lots.estimatedValueEur',
  'lots.tenderValueRange',
  'lots.winner',
  'leadBuyers',
  'nonLeadBuyers',
  'winners',
].join(' ');

const PROMPT = [
  'You check award values of EU public procurement notices (TED) for data-entry errors.',
  'Buyers often drop the decimal separator or type extra zeros, which inflates a value x10, x100 or x1000, and sometimes enter a meaningless number or a wrong currency.',
  'Judge the notice total (`award`) and every lot in `lots` separately.',
  'Verdicts:',
  '- "plausible": the value fits the evidence. National infrastructure, multi-year concessions, central purchasing bodies and large framework agreements CAN be worth billions; never flag a value only because it is big.',
  '- "replaced": a price from `webFindings` is the real value. Give its `findingIndex`. Prefer scope "contract" (or "lot" for a lot) and VAT-excluded prices; use an "estimate" finding only for a framework agreement, where the maximum value is the award value.',
  '- "shifted": the published value is the real one multiplied by 10, 100 or 1000. Give that `factor`. Use it only when the divided value is consistent with the evidence.',
  '- "invalid": the value is clearly wrong, but the real one cannot be derived. It will be removed.',
  'Evidence, strongest first:',
  '1. `webFindings`: prices of this contract found on the web, each quoted from its page. They may still be about a different contract of the same buyer, so check the quote. A finding equal to the published value confirms it.',
  '2. The sum of lots vs the total, the estimate, `rulesCorrections` (values already fixed by automatic rules; `original` is what TED published, a lot with `award` null was dropped by them).',
  '3. `buyers[].typicalAwardEur` (median of the buyer’s other awards) and `buyers[].recentAwards`: only the scale the buyer usually buys at, weak on its own.',
  'Amounts are in the published currency, `eur` fields are converted to EUR.',
  'When unsure, answer "plausible": a wrong correction is worse than a missed one.',
  'Return JSON only, in this exact shape:',
  '{"award":{"verdict":"plausible|replaced|shifted|invalid","findingIndex":0|null,"factor":10|100|1000|null,"reason":"..."},"lots":[{"index":0,"verdict":"replaced|shifted|invalid","findingIndex":0|null,"factor":10|100|1000|null,"reason":"..."}],"confidence":"high|medium|low","reason":"..."}',
  'List in `lots` only the lots that are not plausible, using the `index` from the input. `award` is always required.',
  'Each `reason` is one short English sentence citing the evidence, e.g. "The buyer’s page states 3.199.999,06 EUR; TED lost the decimal separator".',
].join('\n');

const emptyStatus = (): AwardValueReviewRunStatus => ({
  isRunning: false,
  stopRequested: false,
  minAwardValueEur: DEFAULT_MIN_AWARD_VALUE_EUR,
  webSearchEnabled: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  total: 0,
  processed: 0,
  flagged: 0,
  noChange: 0,
  failed: 0,
  withWebPrice: 0,
  errors: [],
});

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const toMoney = (value?: Money | null, eur?: number | null) => ({
  amount: value?.amount ?? null,
  currency: value?.currency ?? null,
  eur: eur ?? null,
});

const median = (values: number[]): number | null => {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const sameMoney = (a: AwardValueReviewMoney, b: AwardValueReviewMoney) =>
  a.amount === b.amount && a.currency === b.currency && a.eur === b.eur;

@Injectable()
export class AwardValueReviewTechService {
  private readonly logger = new Logger(AwardValueReviewTechService.name);
  private status = emptyStatus();

  constructor(
    private readonly llmAnalysisService: LlmAnalysisService,
    private readonly awardPriceSearchService: AwardPriceSearchService,
    private readonly tendersService: TendersService,
    private readonly buyerService: BuyerService,
    private readonly contractorService: ContractorService,
  ) {}

  getStatus(): AwardValueReviewRunStatus {
    return { ...this.status, errors: [...this.status.errors] };
  }

  private recordError(
    stage: AwardValueReviewRunError['stage'],
    message: string,
    example: string,
  ) {
    const errors = this.status.errors;
    const existing = errors.find(
      (e) => e.stage === stage && e.message === message,
    );

    if (existing) {
      existing.count += 1;
    } else if (errors.length < MAX_RUN_ERRORS) {
      errors.push({ stage, message, count: 1, example });
    }
  }

  start(options: AwardValueReviewOptions = {}): AwardValueReviewRunStatus {
    if (this.status.isRunning) {
      return this.getStatus();
    }

    this.status = {
      ...emptyStatus(),
      isRunning: true,
      minAwardValueEur:
        Number(options.minAwardValueEur) || DEFAULT_MIN_AWARD_VALUE_EUR,
      webSearchEnabled: this.awardPriceSearchService.isEnabled(),
      startedAt: new Date(),
    };

    void this.run(options);

    return this.getStatus();
  }

  stop(): AwardValueReviewRunStatus {
    if (this.status.isRunning) {
      this.status.stopRequested = true;
    }

    return this.getStatus();
  }

  async list(status?: AwardValueReviewStatus) {
    const [items, counts] = await Promise.all([
      AwardValueReviewModel.find(status ? { status } : {})
        .sort({ updatedAt: -1 })
        .limit(500)
        .lean(),
      AwardValueReviewModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      items,
      counts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
    };
  }

  async reject(ids: string[]) {
    const result = await AwardValueReviewModel.updateMany(
      { _id: { $in: ids }, status: 'pending' },
      { $set: { status: 'rejected' } },
    );

    return { rejected: result.modifiedCount };
  }

  async apply(ids: string[]) {
    const reviews = await AwardValueReviewModel.find({
      _id: { $in: ids },
      status: 'pending',
    });
    const buyerIds = new Set<string>();
    const contractorIds = new Set<string>();
    const result = { applied: 0, stale: 0 };

    for (const review of reviews) {
      const tender = (await AwardTenderModel.findById(review.awardTender)
        .select(REVIEW_SELECT)
        .lean()) as unknown as StoredAwardTender | null;

      const set = tender ? this.buildApplySet(tender, review) : null;

      if (!tender || !set) {
        review.status = 'stale';
        await review.save();
        result.stale += 1;
        continue;
      }

      await AwardTenderModel.updateOne(
        { _id: tender._id as any },
        { $set: set },
      );

      review.status = 'applied';
      review.appliedAt = new Date();
      await review.save();
      result.applied += 1;

      [...(tender.leadBuyers ?? []), ...(tender.nonLeadBuyers ?? [])]
        .filter(Boolean)
        .forEach((id) => buyerIds.add(String(id)));
      [
        ...(tender.winners ?? []),
        ...(tender.lots ?? []).map((lot) => lot.winner),
      ]
        .filter(Boolean)
        .forEach((id) => contractorIds.add(String(id)));
    }

    await this.refreshInChunks([...buyerIds], (chunk) =>
      this.buyerService.refreshBuyersTenderMeta(chunk),
    );
    await this.refreshInChunks([...contractorIds], (chunk) =>
      this.contractorService.refreshContractorsAwardMeta(chunk),
    );

    return result;
  }

  /**
   * Returns null when the values changed since the review, so the model's
   * suggestion is no longer about what is stored.
   */
  private buildApplySet(
    tender: StoredAwardTender,
    review: AwardValueReviewDocument,
  ): Record<string, unknown> | null {
    const set: Record<string, unknown> = {};
    const corrections: AwardValueCorrection[] = [];

    for (const change of review.changes) {
      const current =
        change.scope === 'tender'
          ? toMoney(tender.awardValue, tender.awardValueEur)
          : toMoney(
              tender.lots?.[change.lotIndex!]?.awardValue,
              tender.lots?.[change.lotIndex!]?.awardValueEur,
            );

      if (!sameMoney(current, change.before)) {
        return null;
      }

      const prefix =
        change.scope === 'tender' ? '' : `lots.${change.lotIndex}.`;
      set[`${prefix}awardValue`] = {
        amount: change.after.amount,
        currency: change.after.currency,
      };
      set[`${prefix}awardValueEur`] = change.after.eur;

      corrections.push({
        scope: change.scope,
        ...(change.scope === 'lot' && { lotIndex: change.lotIndex }),
        rule: 'llm',
        factor: change.factor,
        original: change.before,
        corrected: change.after,
      });
    }

    set.awardValueCorrections = [
      ...(tender.awardValueCorrections ?? []),
      ...corrections,
    ];

    return set;
  }

  private async run(options: AwardValueReviewOptions) {
    const status = this.status;

    try {
      const tenders = await this.findCandidates(
        status.minAwardValueEur,
        !!options.recheck,
        Number(options.limit) || 0,
      );
      status.total = tenders.length;

      let next = 0;
      const worker = async () => {
        while (next < tenders.length && !status.stopRequested) {
          const tender = tenders[next];
          next += 1;
          await this.reviewTender(tender);
          status.processed += 1;
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } catch (error) {
      status.lastError = getSafeErrorMessage(error);
      this.recordError('review', status.lastError, 'run');
    } finally {
      status.isRunning = false;
      status.finishedAt = new Date();
    }
  }

  private async findCandidates(
    minAwardValueEur: number,
    recheck: boolean,
    limit: number,
  ): Promise<StoredAwardTender[]> {
    const reviewed = await AwardValueReviewModel.find({
      status: {
        $in: recheck
          ? ['applied', 'rejected']
          : ['pending', 'applied', 'rejected', 'no_change', 'stale'],
      },
    }).distinct('awardTender');

    const query = AwardTenderModel.find({
      _id: { $nin: reviewed.map(String) as any },
      $or: [
        { awardValueEur: { $gte: minAwardValueEur } },
        { 'lots.awardValueEur': { $gte: minAwardValueEur } },
      ],
    })
      .select(REVIEW_SELECT)
      .sort({ awardValueEur: -1 });

    if (limit > 0) {
      query.limit(limit);
    }

    return query.lean<StoredAwardTender[]>();
  }

  private async reviewTender(tender: StoredAwardTender) {
    const base = {
      awardTender: tender._id,
      tenderId: tender.id,
      title: tender.title ?? '',
      llmProvider: this.llmAnalysisService.getGeneralAnalysisProvider(),
      llmModel: this.llmAnalysisService.getGeneralAnalysisModel(),
      appliedAt: null,
    };

    try {
      const { context, buyers, winnerNames } = await this.buildContext(tender);
      const webSearch = await this.searchWebPrice(tender, buyers, winnerNames);
      const findings = webSearch?.findings ?? [];

      if (findings.length) {
        this.status.withWebPrice += 1;
      }

      for (const error of webSearch?.errors ?? []) {
        this.recordError(error.stage, error.message, error.target);
      }

      const response = await this.llmAnalysisService.createGeneralJsonResponse(
        PROMPT,
        JSON.stringify(
          {
            ...context,
            webSearched: !!webSearch,
            webFindings: findings.map((finding, index) => ({
              index,
              ...finding,
            })),
          },
          null,
          2,
        ),
      );
      const changes = await this.buildChanges(tender, response, findings);
      const reviewStatus: AwardValueReviewStatus = changes.length
        ? 'pending'
        : 'no_change';

      await this.saveReview({
        ...base,
        buyerName: buyers.map((b) => b.name).join(', '),
        status: reviewStatus,
        confidence: this.readConfidence(response),
        reason:
          isRecord(response) && typeof response.reason === 'string'
            ? response.reason
            : '',
        changes,
        webSearch,
        errorMessage: null,
      });

      if (changes.length) {
        this.status.flagged += 1;
      } else {
        this.status.noChange += 1;
      }
    } catch (error) {
      this.status.failed += 1;
      this.recordError('review', getSafeErrorMessage(error), tender.id);
      this.logger.warn(
        `Award value review failed for ${tender.id}: ${getSafeErrorMessage(error)}`,
      );

      await this.saveReview({
        ...base,
        status: 'failed',
        confidence: null,
        reason: '',
        changes: [],
        errorMessage: getSafeErrorMessage(error),
      });
    }
  }

  private async searchWebPrice(
    tender: StoredAwardTender,
    buyers: BuyerContext[],
    winnerNames: string[],
  ): Promise<AwardPriceSearchResult | null> {
    if (!this.awardPriceSearchService.isEnabled()) {
      return null;
    }

    return this.awardPriceSearchService.search({
      title: tender.titleProc || tender.title || '',
      buyerName: buyers[0]?.name ?? '',
      winnerNames,
      country:
        buyers[0]?.country ?? tender.placeOfPerformanceCountries?.[0] ?? null,
      publishedValue: {
        amount: tender.awardValue?.amount ?? null,
        currency: tender.awardValue?.currency ?? null,
      },
      estimatedValue: {
        amount: tender.estimatedValue?.amount ?? null,
        currency: tender.estimatedValue?.currency ?? null,
      },
    });
  }

  private saveReview(review: Partial<AwardValueReview>) {
    return AwardValueReviewModel.updateOne(
      { awardTender: review.awardTender },
      { $set: review },
      { upsert: true },
    );
  }

  // What TED published for a lot whose value the rules dropped
  private getDroppedLotOriginal(
    tender: StoredAwardTender,
    lotIndex: number,
  ): AwardValueReviewMoney | null {
    const correction = (tender.awardValueCorrections ?? []).find(
      (c) =>
        c.scope === 'lot' &&
        c.lotIndex === lotIndex &&
        c.rule !== 'llm' &&
        c.corrected.eur === null,
    );

    return correction && isPositive(correction.original.eur)
      ? correction.original
      : null;
  }

  private isReviewableLot(tender: StoredAwardTender, lotIndex: number) {
    const lot = tender.lots?.[lotIndex];

    return (
      !!lot &&
      (isPositive(lot.awardValueEur) ||
        !!this.getDroppedLotOriginal(tender, lotIndex))
    );
  }

  private async buildContext(tender: StoredAwardTender) {
    const allLots = tender.lots ?? [];
    const lots = allLots
      .map((lot, index) => ({
        lot,
        index,
        size:
          lot.awardValueEur ??
          this.getDroppedLotOriginal(tender, index)?.eur ??
          0,
      }))
      .filter(({ index }) => this.isReviewableLot(tender, index))
      .sort((a, b) => b.size - a.size)
      .slice(0, MAX_LOTS_IN_PROMPT);

    const winnerIds = [
      ...new Set(
        [...lots.map(({ lot }) => lot.winner), ...(tender.winners ?? [])]
          .filter(Boolean)
          .map(String),
      ),
    ];
    const [winners, buyers] = await Promise.all([
      ContractorModel.find({ _id: { $in: winnerIds as any } })
        .select('name')
        .lean(),
      this.buildBuyersContext(tender),
    ]);
    const winnerNames = new Map(
      winners.map((w) => [String(w._id), (w as { name?: string }).name]),
    );

    return {
      buyers,
      winnerNames: [...winnerNames.values()]
        .filter((name): name is string => !!name)
        .slice(0, MAX_WINNERS),
      context: {
        title: tender.title,
        description: tender.description?.slice(0, MAX_DESCRIPTION_LENGTH),
        cpvCodes: tender.cpvCodes,
        contractNature: tender.contractNature,
        procedureType: tender.procedureType,
        isFrameworkAgreement: tender.isFrameworkAgreement,
        publicationDate: tender.publicationDate,
        countries: tender.placeOfPerformanceCountries,
        award: toMoney(tender.awardValue, tender.awardValueEur),
        estimate: toMoney(tender.estimatedValue, tender.estimatedValueEur),
        lotsCount: allLots.length,
        lotsWithValue: allLots.filter((l) => isPositive(l.awardValueEur))
          .length,
        lotsSumEur: allLots.reduce(
          (acc, l) => acc + (isPositive(l.awardValueEur) ? l.awardValueEur : 0),
          0,
        ),
        lots: lots.map(({ lot, index }) => ({
          index,
          title: lot.title,
          award: toMoney(lot.awardValue, lot.awardValueEur),
          publishedInTed: this.getDroppedLotOriginal(tender, index),
          estimateEur: lot.estimatedValueEur ?? null,
          tenderValueRange: lot.tenderValueRange ?? null,
          winner: winnerNames.get(String(lot.winner)) ?? null,
        })),
        rulesCorrections: (tender.awardValueCorrections ?? []).map((c) => ({
          scope: c.scope,
          lotIndex: c.lotIndex,
          rule: c.rule,
          original: c.original,
          corrected: c.corrected,
        })),
        buyers,
      },
    };
  }

  private async buildBuyersContext(
    tender: StoredAwardTender,
  ): Promise<BuyerContext[]> {
    const buyerIds = (tender.leadBuyers ?? []).slice(0, 2).map(String);

    return Promise.all(
      buyerIds.map(async (buyerId) => {
        const [buyer, history] = await Promise.all([
          BuyerModel.findById(buyerId).select('name address.country').lean(),
          AwardTenderModel.find({
            leadBuyers: buyerId,
            _id: { $ne: tender._id as any },
          })
            .select('title awardValueEur publicationDate')
            .sort({ publicationDate: -1 })
            .limit(BUYER_HISTORY_LIMIT)
            .lean(),
        ]);
        const values = history.map((h) => h.awardValueEur).filter(isPositive);

        return {
          name: buyer?.name ?? '',
          country: buyer?.address?.country ?? null,
          otherAwardsCount: history.length,
          typicalAwardEur: median(values),
          recentAwards: history
            .filter((h) => isPositive(h.awardValueEur))
            .slice(0, BUYER_SAMPLES)
            .map((h) => ({
              title: h.title?.slice(0, 120),
              eur: h.awardValueEur,
            })),
        };
      }),
    );
  }

  private async buildChanges(
    tender: StoredAwardTender,
    response: unknown,
    findings: AwardPriceFinding[],
  ): Promise<AwardValueReviewChange[]> {
    if (!isRecord(response)) {
      throw new Error('LLM response is not an object');
    }

    const changes: AwardValueReviewChange[] = [];
    const award = this.readVerdict(response.award, findings);

    if (!award) {
      throw new Error('LLM response has no valid "award" verdict');
    }

    if (award.verdict !== 'plausible' && isPositive(tender.awardValueEur)) {
      const before = toMoney(tender.awardValue, tender.awardValueEur);
      const change = await this.buildChange(tender, before, before, award);

      if (change) {
        changes.push({ scope: 'tender', ...change });
      }
    }

    const lots = Array.isArray(response.lots) ? response.lots : [];

    for (const item of lots) {
      const verdict = this.readVerdict(item, findings);
      const index = isRecord(item) ? Number(item.index) : NaN;
      const lot = tender.lots?.[index];

      if (
        !verdict ||
        verdict.verdict === 'plausible' ||
        !lot ||
        !this.isReviewableLot(tender, index) ||
        changes.some((c) => c.scope === 'lot' && c.lotIndex === index)
      ) {
        continue;
      }

      const before = toMoney(lot.awardValue, lot.awardValueEur);
      // A shift of a dropped lot is applied to what TED published
      const shiftBase = isPositive(before.eur)
        ? before
        : this.getDroppedLotOriginal(tender, index)!;
      const change = await this.buildChange(tender, before, shiftBase, verdict);

      if (change) {
        changes.push({
          scope: 'lot',
          lotIndex: index,
          lotTitle: lot.title ?? '',
          ...change,
        });
      }
    }

    return changes;
  }

  private async buildChange(
    tender: StoredAwardTender,
    before: AwardValueReviewMoney,
    shiftBase: AwardValueReviewMoney,
    verdict: LlmVerdict,
  ): Promise<Omit<AwardValueReviewChange, 'scope'> | null> {
    const after = await this.resolveAfter(tender, shiftBase, verdict);

    // Nothing would change, or a found price can't be converted to EUR
    if (!after || sameMoney(before, after)) {
      return null;
    }

    return {
      verdict: verdict.verdict as AwardValueReviewChange['verdict'],
      factor: verdict.factor,
      reason: verdict.reason,
      ...(verdict.finding && { source: verdict.finding }),
      before,
      after,
    };
  }

  private readVerdict(
    value: unknown,
    findings: AwardPriceFinding[],
  ): LlmVerdict | null {
    if (!isRecord(value)) {
      return null;
    }

    const reason = typeof value.reason === 'string' ? value.reason : '';

    if (value.verdict === 'plausible' || value.verdict === 'invalid') {
      return { verdict: value.verdict, factor: null, finding: null, reason };
    }

    if (value.verdict === 'replaced') {
      // The value comes from our verified finding, never from the model
      const finding = findings[Number(value.findingIndex)];

      return finding
        ? { verdict: 'replaced', factor: null, finding, reason }
        : null;
    }

    const factor = Number(value.factor);

    // A shift without a known factor can't be applied, treat as a miss
    if (value.verdict === 'shifted' && SHIFT_FACTORS.includes(factor)) {
      return { verdict: 'shifted', factor, finding: null, reason };
    }

    return null;
  }

  private readConfidence(response: unknown) {
    const confidence = isRecord(response) ? response.confidence : null;

    return confidence === 'high' ||
      confidence === 'medium' ||
      confidence === 'low'
      ? confidence
      : null;
  }

  private async resolveAfter(
    tender: StoredAwardTender,
    value: AwardValueReviewMoney,
    verdict: LlmVerdict,
  ): Promise<AwardValueReviewMoney | null> {
    if (verdict.verdict === 'replaced' && verdict.finding) {
      const { amount, currency } = verdict.finding;
      const eur =
        currency === 'EUR'
          ? Math.round(amount)
          : await this.tendersService._calculateEstimatedValueEur(
              amount,
              currency,
              tender.publicationDate,
            );

      return eur === null ? null : { amount, currency, eur };
    }

    if (verdict.verdict === 'shifted' && verdict.factor) {
      return {
        amount: isPositive(value.amount) ? value.amount / verdict.factor : null,
        currency: value.currency,
        eur: isPositive(value.eur)
          ? Math.round(value.eur / verdict.factor)
          : null,
      };
    }

    return { amount: null, currency: value.currency, eur: null };
  }

  private async refreshInChunks(
    ids: string[],
    refresh: (ids: string[]) => Promise<unknown>,
  ) {
    for (let i = 0; i < ids.length; i += REFRESH_CHUNK_SIZE) {
      await refresh(ids.slice(i, i + REFRESH_CHUNK_SIZE));
    }
  }
}
