import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CurrencyExchangeRatesService } from '@/resources/currency-exchange-rates/currency-exchange-rates.service';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import { TenderLot, TenderShortTitle } from '@/resources/tenders/schemas';
import {
  NationalAmendmentApplyStatus,
  NationalTenderAmendment,
  NationalTenderPatch,
  NationalTenderShortTitleHolder,
  NationalTenderSource,
  NationalTenderStoreResult,
  NormalizedNationalTender,
} from './national-tender.types';
import {
  NationalTenderDocument,
  NationalTenderModel,
} from './schemas/national-tender.schema';

const SHORT_TITLE_BATCH_SIZE = 20;

export interface NationalTenderStoreOptions {
  /** Re-save even when the normalized content did not change. */
  force?: boolean;
  /** Generate AI short titles for saved tenders that lack them. */
  generateShortTitles?: boolean;
}

/**
 * Country-agnostic persistence for national tenders: change detection,
 * EUR conversion, upsert and short titles. Country modules only normalize.
 */
@Injectable()
export class NationalTendersStorageService {
  private readonly logger = new Logger(NationalTendersStorageService.name);

  constructor(
    private readonly currencyExchangeRatesService: CurrencyExchangeRatesService,
    private readonly llmAnalysisService: LlmAnalysisService,
  ) {}

  async storeMany(
    tenders: NormalizedNationalTender[],
    options: NationalTenderStoreOptions = {},
  ): Promise<NationalTenderStoreResult> {
    const result: NationalTenderStoreResult = {
      saved: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
    };
    const needShortTitle: NationalTenderShortTitleHolder[] = [];

    for (const tender of tenders) {
      try {
        const outcome = await this.storeOne(tender, options.force);

        result[outcome.status] += 1;

        if (
          outcome.doc &&
          !this.hasCompleteShortTitle(outcome.doc.shortTitle)
        ) {
          needShortTitle.push(outcome.doc);
        }
      } catch (e: unknown) {
        result.failed += 1;
        this.logger.warn(
          `Failed to store national tender ${tender.id}: ${
            e instanceof Error ? e.message : 'unknown error'
          }`,
        );
      }
    }

    if (options.generateShortTitles) {
      await this.fillMissingShortTitles(needShortTitle);
    }

    return result;
  }

  findById(id: string, withRawData = false) {
    const query = NationalTenderModel.findOne({ id });

    return withRawData ? query.select('+rawData') : query;
  }

  buildSourceHash(tender: NormalizedNationalTender): string {
    // rawData is excluded on purpose: only normalized changes matter.

    const { rawData, ...normalized } = tender;

    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  private async storeOne(
    tender: NormalizedNationalTender,
    force?: boolean,
  ): Promise<{
    status: 'saved' | 'updated' | 'unchanged';
    doc?: NationalTenderDocument;
  }> {
    const sourceHash = this.buildSourceHash(tender);
    const existing = await NationalTenderModel.findOne({ id: tender.id })
      .select('sourceHash amendments.patch')
      .lean();

    if (existing && existing.sourceHash === sourceHash && !force) {
      return { status: 'unchanged' };
    }

    // Amendments override fields of the original notice (e.g. a moved deadline).
    const patch = this.mergePatches(existing?.amendments ?? []);

    const [estimatedValueEur, lots] = await Promise.all([
      this.toEur(tender.estimatedValue, tender.publicationDate),
      Promise.all(
        tender.lots.map(
          async (lot): Promise<TenderLot> => ({
            ...lot,
            estimatedValueEur: await this.toEur(
              lot.estimatedValue,
              tender.publicationDate,
            ),
          }),
        ),
      ),
    ]);

    const doc = await NationalTenderModel.findOneAndUpdate(
      { id: tender.id },
      {
        $set: {
          ...tender,
          ...patch,
          lots,
          estimatedValueEur,
          sourceHash,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return { status: existing ? 'updated' : 'saved', doc };
  }

  /**
   * Applies an amendment notice to the stored tender it amends.
   * Idempotent: an amendment with the same `sourceId` is applied once.
   */
  async applyAmendment(
    source: NationalTenderSource,
    tenderSourceId: string,
    amendment: NationalTenderAmendment,
  ): Promise<NationalAmendmentApplyStatus> {
    const result = await NationalTenderModel.updateOne(
      {
        source,
        sourceId: tenderSourceId,
        'amendments.sourceId': { $ne: amendment.sourceId },
      },
      {
        $push: { amendments: amendment },
        $set: amendment.patch,
      },
    );

    if (result.matchedCount) {
      return 'applied';
    }

    const exists = await NationalTenderModel.exists({
      source,
      sourceId: tenderSourceId,
    });

    return exists ? 'duplicate' : 'notFound';
  }

  /** Latest publication date of an applied amendment for the source. */
  async findLatestAmendmentDate(
    source: NationalTenderSource,
  ): Promise<Date | undefined> {
    // Descending sort on an array field orders by its largest element.
    const latest = await NationalTenderModel.findOne({
      source,
      'amendments.0': { $exists: true },
    })
      .sort({ 'amendments.publicationDate': -1 })
      .select('amendments.publicationDate')
      .lean();
    const times = (latest?.amendments ?? [])
      .map((amendment) => amendment.publicationDate?.getTime())
      .filter((time): time is number => !!time);

    return times.length ? new Date(Math.max(...times)) : undefined;
  }

  private mergePatches(
    amendments: Pick<NationalTenderAmendment, 'patch'>[],
  ): NationalTenderPatch {
    const merged: NationalTenderPatch = {};

    for (const { patch } of amendments) {
      for (const [key, value] of Object.entries(patch ?? {})) {
        if (value !== undefined && value !== null) {
          (merged as Record<string, unknown>)[key] = value;
        }
      }
    }

    return merged;
  }

  private async toEur(
    value: { amount?: number | null; currency?: string | null } | undefined,
    date?: Date,
  ): Promise<number | null> {
    if (!value?.amount || !value.currency) {
      return null;
    }

    const eur = await this.currencyExchangeRatesService.convertToEur(
      value.amount,
      value.currency,
      date,
    );

    return eur === null ? null : Math.round(eur);
  }

  private async fillMissingShortTitles(
    tenders: NationalTenderShortTitleHolder[],
  ): Promise<void> {
    const pending = tenders.filter((tender) => tender.title);

    for (let i = 0; i < pending.length; i += SHORT_TITLE_BATCH_SIZE) {
      const batch = pending.slice(i, i + SHORT_TITLE_BATCH_SIZE);

      try {
        const generated =
          await this.llmAnalysisService.generateTenderShortTitles(
            batch.map((tender) => ({ id: tender.id, title: tender.title! })),
          );

        await Promise.all(
          generated
            .filter((item) => this.hasCompleteShortTitle(item.shortTitle))
            .map((item) =>
              NationalTenderModel.updateOne(
                { id: item.id },
                { $set: { shortTitle: item.shortTitle } },
              ),
            ),
        );
      } catch (e: unknown) {
        this.logger.warn(
          `Failed to generate national tender short titles: ${
            e instanceof Error ? e.message : 'unknown error'
          }`,
        );
      }
    }
  }

  private hasCompleteShortTitle(value?: TenderShortTitle | null): boolean {
    return Boolean(value?.en && value.de && value.fr && value.pl && value.ru);
  }
}
