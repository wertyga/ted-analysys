import { Injectable } from '@nestjs/common';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import { TenderModel } from '@/resources/tenders/schemas';

@Injectable()
export class TendersTechService {
  constructor(private readonly llmAnalysisService: LlmAnalysisService) {}

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
}


