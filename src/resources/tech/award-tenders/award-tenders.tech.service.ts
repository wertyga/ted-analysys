import { Injectable } from '@nestjs/common';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { AWARD_TENDER_CONFIG } from '@/config/award-tender.config';
import { TedTenderSearchFilters } from '@/resources/ted-search/ted-builders';
import { getTedDate } from '@/resources/ted-search/utils';
import { TedPaginationMode } from '@/resources/ted-search/types/ted-search.types';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { getAwardDateExpression } from '@/resources/award-tender/utils';
import { BuyerModel } from '@/resources/buyer/schemas';

export type AwardTendersRefreshStatus = {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  pagesFetched: number;
  noticesFetched: number;
  totalNoticeCount?: number;
  totalDateChunks: number;
  processedDateChunks: number;
  incompleteDateChunks: number;
  currentDateChunk: {
    from: string;
    to: string;
  } | null;
};

type AwardTenderDateChunk = {
  from: string;
  to: string;
  pagesFetched?: number;
  noticesFetched?: number;
  totalNoticeCount?: number;
};

const emptyAwardTendersRefreshStatus = (): AwardTendersRefreshStatus => ({
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  pagesFetched: 0,
  noticesFetched: 0,
  totalDateChunks: 0,
  processedDateChunks: 0,
  incompleteDateChunks: 0,
  currentDateChunk: null,
});

@Injectable()
export class AwardTendersTechService {
  private refreshStatus = emptyAwardTendersRefreshStatus();

  constructor(
    private readonly tedOpenTendersCollectorService: TedOpenTendersCollectorService,
  ) {}

  // Recomputes awardDate from awardDecisionDates for all saved award tenders
  async backfillAwardDates() {
    const result = await AwardTenderModel.updateMany(
      {},
      [{ $set: { awardDate: getAwardDateExpression() } }],
      { updatePipeline: true },
    );

    return {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      withoutAwardDate: await AwardTenderModel.countDocuments({
        awardDate: null,
      }),
    };
  }

  // Same fallback as on import: no place of performance -> lead buyer country
  async backfillAwardCountries() {
    const withoutCountry = {
      'placeOfPerformanceCountries.0': { $exists: false },
    };
    const before = await AwardTenderModel.countDocuments(withoutCountry);

    await AwardTenderModel.aggregate([
      { $match: withoutCountry },
      {
        $lookup: {
          from: BuyerModel.collection.name,
          localField: 'leadBuyers',
          foreignField: '_id',
          as: 'leadBuyerDocs',
        },
      },
      {
        $project: {
          placeOfPerformanceCountries: {
            $setUnion: [
              {
                $filter: {
                  input: '$leadBuyerDocs.address.country',
                  cond: {
                    $gt: [{ $strLenCP: { $ifNull: ['$$this', ''] } }, 0],
                  },
                },
              },
            ],
          },
        },
      },
      { $match: { 'placeOfPerformanceCountries.0': { $exists: true } } },
      {
        $merge: {
          into: AwardTenderModel.collection.name,
          on: '_id',
          whenMatched: 'merge',
          whenNotMatched: 'discard',
        },
      },
    ]).allowDiskUse(true);

    const after = await AwardTenderModel.countDocuments(withoutCountry);

    return { filled: before - after, withoutCountry: after };
  }

  getRefreshAwardTendersHistoryStatus(): AwardTendersRefreshStatus {
    return { ...this.refreshStatus };
  }

  startRefreshAwardTendersHistory(
    filters?: TedTenderSearchFilters,
    options: {
      pageLimit?: number;
      paginationMode?: TedPaginationMode;
      skipExistingByPublicationNumber?: boolean;
    } = {},
  ): AwardTendersRefreshStatus {
    if (this.refreshStatus.isRunning) {
      return this.getRefreshAwardTendersHistoryStatus();
    }

    void this.refreshAwardTendersHistory(filters, options);

    return this.getRefreshAwardTendersHistoryStatus();
  }

  async refreshAwardTendersHistory(
    filters?: TedTenderSearchFilters,
    options: {
      pageLimit?: number;
      paginationMode?: TedPaginationMode;
      skipExistingByPublicationNumber?: boolean;
    } = {},
  ): Promise<AwardTendersRefreshStatus> {
    if (this.refreshStatus.isRunning) {
      return this.getRefreshAwardTendersHistoryStatus();
    }

    this.refreshStatus = {
      ...emptyAwardTendersRefreshStatus(),
      isRunning: true,
      startedAt: new Date(),
    };
    const status = this.refreshStatus;
    const pageLimit = options.pageLimit ? Number(options.pageLimit) : 50;
    const dateChunks = this.buildDateChunks(
      AWARD_TENDER_CONFIG.historyYearsBack,
      AWARD_TENDER_CONFIG.historyChunkDays,
    );

    try {
      status.totalDateChunks = dateChunks.length;
      status.totalNoticeCount = 0;
      let cumulativePagesFetched = 0;
      let cumulativeNoticesFetched = 0;
      let cumulativeTotalNoticeCount = 0;

      for (const dateChunk of dateChunks) {
        status.currentDateChunk = dateChunk;

        const result =
          await this.tedOpenTendersCollectorService.collectResultTendersFromTed(
            {
              publicationDateFrom: dateChunk.from,
              publicationDateTo: dateChunk.to,
              filters,
            },
            {
              pageLimit,
              paginationMode:
                options.paginationMode ?? TedPaginationMode.PAGE_NUMBER,
              updateExisting: true,
              skipExistingByPublicationNumber:
                options.skipExistingByPublicationNumber,
              onProgress: (progress) => {
                status.pagesFetched =
                  cumulativePagesFetched + progress.pagesFetched;
                status.noticesFetched =
                  cumulativeNoticesFetched + progress.noticesFetched;
                status.totalNoticeCount =
                  cumulativeTotalNoticeCount + (progress.totalNoticeCount ?? 0);
              },
            },
          );

        dateChunk.pagesFetched = result.pagesFetched;
        dateChunk.noticesFetched = result.noticesFetched;
        dateChunk.totalNoticeCount = result.totalNoticeCount;
        status.processedDateChunks += 1;
        if (
          result.totalNoticeCount !== undefined &&
          result.noticesFetched < result.totalNoticeCount
        ) {
          status.incompleteDateChunks += 1;
        }
        cumulativePagesFetched += result.pagesFetched;
        cumulativeNoticesFetched += result.noticesFetched;
        cumulativeTotalNoticeCount += result.totalNoticeCount ?? 0;
        status.pagesFetched = cumulativePagesFetched;
        status.noticesFetched = cumulativeNoticesFetched;
        status.totalNoticeCount = cumulativeTotalNoticeCount;
      }

      status.currentDateChunk = null;
    } catch (error) {
      status.lastError =
        error instanceof Error ? error.message : 'Unknown error';
    } finally {
      status.isRunning = false;
      status.currentDateChunk = null;
      status.finishedAt = new Date();
    }

    return this.getRefreshAwardTendersHistoryStatus();
  }

  private buildDateChunks(
    yearsBack: number,
    chunkDays: number,
  ): AwardTenderDateChunk[] {
    const end = new Date();
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - yearsBack);
    const normalizedChunkDays = Math.max(1, Math.floor(chunkDays));

    const chunks: AwardTenderDateChunk[] = [];
    const cursor = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );

    while (cursor <= end) {
      const chunkStart = new Date(cursor);
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + normalizedChunkDays - 1);

      if (chunkEnd > end) {
        chunkEnd.setTime(end.getTime());
      }

      chunks.push({
        from: getTedDate(chunkStart),
        to: getTedDate(chunkEnd),
      });

      cursor.setTime(chunkEnd.getTime());
      cursor.setDate(cursor.getDate() + 1);
    }

    return chunks;
  }
}
