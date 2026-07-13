import { Injectable } from '@nestjs/common';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import {
  TenderDocumentsLinks,
  TenderLot,
  TenderModel,
} from '@/resources/tenders/schemas';
import {
  TenderGeneralAnalysisModel,
  TenderGeneralAnalysisRecord,
} from '@/resources/tender-analysis/schemas';
import { TenderGeneralAnalysisService } from '@/resources/tender-analysis/tender-general-analysis.service';
import { getSafeErrorMessage } from '@/utils';
import {
  fetchAwardCriteriaFromXml,
  XmlAwardCriterion,
} from '@/resources/tender-normalizer/tender-normalizer-xml';

type GenerateTenderGeneralAnalysesResult = {
  scannedCount: number;
  matchedCount: number;
  enqueuedCount: number;
  skippedCount: number;
  limit: number;
  batchSize: number;
  errors: Array<{ id: string; message: string }>;
};

type FixTenderLotAwardCriteriaResult = {
  totalCount: number;
  scannedCount: number;
  remainingCount: number;
  xmlFetchedCount: number;
  xmlWithoutCriteriaCount: number;
  matchedCount: number;
  updatedCount: number;
  dryRun: boolean;
  batchSize: number;
  changedTenderIds: string[];
  errors: Array<{ id: string; message: string }>;
};

@Injectable()
export class TendersTechService {
  constructor(
    private readonly llmAnalysisService: LlmAnalysisService,
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  async getTenderShortTitlesByTenderId() {
    const tenders = await TenderModel.find({
      shortTitle: { $exists: true, $ne: null },
    })
      .select('id shortTitle')
      .sort({ id: 1 })
      .lean();

    return tenders.reduce<Record<string, unknown>>((acc, tender) => {
      if (tender.id && tender.shortTitle) {
        acc[tender.id] = tender.shortTitle;
      }

      return acc;
    }, {});
  }

  async generateMissingTenderShortTitles(options: {
    limit?: number;
    batchSize?: number;
  }) {
    const limit = options.limit ? Number(options.limit) : null;
    const batchSize = Number(options.batchSize);
    const query = {
      title: { $exists: true, $nin: [null, ''] },
      $or: [{ shortTitle: { $exists: false } }, { shortTitle: null }],
    };

    const tendersQuery = TenderModel.find(query)
      .select('_id id title')
      .sort({ createdAt: 1 })
      .lean();

    if (limit) {
      tendersQuery.limit(limit);
    }

    const tenders = await tendersQuery.exec();
    let updatedCount = 0;
    const errors: Array<{ id: string; message: string }> = [];

    for (let index = 0; index < tenders.length; index += batchSize) {
      const batch = tenders.slice(index, index + batchSize);

      try {
        const generated =
          await this.llmAnalysisService.generateTenderShortTitles(
            batch.map((tender) => ({
              id: tender.id,
              title: tender.title ?? '',
            })),
          );
        const byId = new Map(generated.map((item) => [item.id, item]));

        await Promise.all(
          batch.map(async (tender) => {
            const item = byId.get(tender.id);

            if (!item) {
              errors.push({
                id: tender.id,
                message: 'DeepSeek response did not include tender id',
              });

              return;
            }

            const updateResult = await TenderModel.updateOne(
              {
                id: tender.id,
                $or: [{ shortTitle: { $exists: false } }, { shortTitle: null }],
              },
              { $set: { shortTitle: item.shortTitle } },
            ).exec();

            updatedCount += updateResult.modifiedCount;
          }),
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        batch.forEach((tender) => {
          errors.push({ id: tender.id, message });
        });
      }
    }

    return {
      matchedCount: tenders.length,
      updatedCount,
      failedCount: errors.length,
      batchSize,
      errors,
    };
  }

  async generateMissingOrStaleTenderGeneralAnalyses(options: {
    limit?: number;
    batchSize?: number;
  }): Promise<GenerateTenderGeneralAnalysesResult> {
    const limit = Math.min(Math.max(Number(options.limit ?? 100), 1), 1000);
    const batchSize = Math.min(
      Math.max(Number(options.batchSize ?? 100), 1),
      500,
    );
    const result: GenerateTenderGeneralAnalysesResult = {
      scannedCount: 0,
      matchedCount: 0,
      enqueuedCount: 0,
      skippedCount: 0,
      limit,
      batchSize,
      errors: [],
    };
    const cursor = TenderModel.find({})
      .sort({ createdAt: 1, _id: 1 })
      .cursor();
    let batch: Awaited<ReturnType<typeof cursor.next>>[] = [];

    const flushBatch = async () => {
      const tenders = batch.flatMap((tender) => (tender ? [tender] : []));

      batch = [];

      if (tenders.length === 0 || result.enqueuedCount >= limit) {
        return;
      }

      const analyses = await TenderGeneralAnalysisModel.find({
        tenderId: { $in: tenders.map((tender) => tender.id) },
      })
        .select('tenderId sourceHash')
        .lean<TenderGeneralAnalysisRecord[]>()
        .exec();
      const analysisByTenderId = new Map(
        analyses.map((analysis) => [analysis.tenderId, analysis]),
      );

      for (const tender of tenders) {
        if (result.enqueuedCount >= limit) {
          return;
        }

        result.scannedCount += 1;

        const expectedSourceHash =
          this.tenderGeneralAnalysisService.buildGeneralTenderAnalysisSourceHash(
            tender,
          );
        const existingAnalysis = analysisByTenderId.get(tender.id);

        if (existingAnalysis?.sourceHash === expectedSourceHash) {
          result.skippedCount += 1;

          continue;
        }

        result.matchedCount += 1;

        try {
          await this.tenderGeneralAnalysisService.ensureAnalysisForTender(
            tender,
          );
          result.enqueuedCount += 1;
        } catch (error: unknown) {
          result.errors.push({
            id: tender.id,
            message: getSafeErrorMessage(error),
          });
        }
      }
    };

    for await (const tender of cursor) {
      if (result.enqueuedCount >= limit) {
        break;
      }

      batch.push(tender);

      if (batch.length >= batchSize) {
        await flushBatch();
      }
    }

    await flushBatch();

    return result;
  }

  async fixTenderLotAwardCriteria(options: {
    batchSize?: number;
    ids?: string[];
    dryRun?: boolean;
  }): Promise<FixTenderLotAwardCriteriaResult> {
    const batchSize = Math.min(
      Math.max(Number(options.batchSize ?? 100), 1),
      5000,
    );
    const ids = options.ids?.filter(Boolean) ?? [];
    const dryRun = options.dryRun === true;
    const result: FixTenderLotAwardCriteriaResult = {
      totalCount: 0,
      scannedCount: 0,
      remainingCount: 0,
      xmlFetchedCount: 0,
      xmlWithoutCriteriaCount: 0,
      matchedCount: 0,
      updatedCount: 0,
      dryRun,
      batchSize,
      changedTenderIds: [],
      errors: [],
    };
    const query =
      ids.length > 0
        ? { id: { $in: ids } }
        : {
            'links.xml': { $exists: true },
            lots: { $elemMatch: { identifier: { $exists: true, $ne: null } } },
          };
    result.totalCount = await TenderModel.countDocuments(query).exec();
    result.remainingCount = result.totalCount;

    const cursor = TenderModel.find(query)
      .select('_id id links lots')
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .cursor({ batchSize });

    for await (const tender of cursor) {
      result.scannedCount += 1;
      result.remainingCount = Math.max(
        result.totalCount - result.scannedCount,
        0,
      );

      try {
        if (!this.hasXmlLinks(tender.links)) {
          continue;
        }

        const xmlCriteria = await fetchAwardCriteriaFromXml(tender.links);
        result.xmlFetchedCount += 1;

        if (xmlCriteria.length === 0) {
          result.xmlWithoutCriteriaCount += 1;
          continue;
        }

        const fixedLots = this.fixLotsAwardCriteriaFromXml(
          tender.lots ?? [],
          xmlCriteria,
        );

        if (!this.hasLotsChanged(tender.lots ?? [], fixedLots)) {
          continue;
        }

        result.matchedCount += 1;
        result.changedTenderIds.push(tender.id);

        if (dryRun) {
          continue;
        }

        const update = await TenderModel.updateOne(
          { _id: tender._id },
          { $set: { lots: fixedLots } },
        ).exec();

        result.updatedCount += update.modifiedCount;
      } catch (error: unknown) {
        result.errors.push({
          id: tender.id,
          message: getSafeErrorMessage(error),
        });
      }
    }

    return result;
  }

  getTenderGeneralAnalysisStatus() {
    return this.tenderGeneralAnalysisService.getBaseAnalysisQueueStatus();
  }

  private hasXmlLinks(value: unknown): value is TenderDocumentsLinks {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { xml?: unknown }).xml === 'object' &&
      (value as { xml?: unknown }).xml !== null
    );
  }

  private fixLotsAwardCriteriaFromXml(
    lots: TenderLot[],
    xmlCriteria: XmlAwardCriterion[],
  ): TenderLot[] {
    return lots.map((lot) => {
      const awardCriteria = xmlCriteria
        .filter((criterion) => {
          return (
            criterion.lotId === lot.identifier ||
            criterion.lotInternalId === lot.identifier
          );
        })
        .map((criterion) => ({
          name: criterion.name,
          type: criterion.type,
          description: criterion.description,
          weight: criterion.weight ?? null,
          weightCode: criterion.weightCode,
        }));

      return {
        ...lot,
        awardCriteria,
      };
    });
  }

  private hasLotsChanged(before: TenderLot[], after: TenderLot[]): boolean {
    return JSON.stringify(before) !== JSON.stringify(after);
  }
}


