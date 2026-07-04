import { Injectable } from '@nestjs/common';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { AWARD_TENDER_CONFIG } from '@/config/award-tender.config';
import { TedTenderSearchFilters } from '@/resources/ted-search/ted-builders';

export type AwardTendersRefreshStatus = {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  pagesFetched: number;
  noticesFetched: number;
  totalNoticeCount?: number;
};

const emptyAwardTendersRefreshStatus = (): AwardTendersRefreshStatus => ({
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  pagesFetched: 0,
  noticesFetched: 0,
});

@Injectable()
export class AwardTendersTechService {
  private refreshStatus = emptyAwardTendersRefreshStatus();

  constructor(
    private readonly tedOpenTendersCollectorService: TedOpenTendersCollectorService,
  ) {}

  getRefreshAwardTendersHistoryStatus(): AwardTendersRefreshStatus {
    return { ...this.refreshStatus };
  }

  startRefreshAwardTendersHistory(
    filters?: TedTenderSearchFilters,
  ): AwardTendersRefreshStatus {
    if (this.refreshStatus.isRunning) {
      return this.getRefreshAwardTendersHistoryStatus();
    }

    void this.refreshAwardTendersHistory(filters);

    return this.getRefreshAwardTendersHistoryStatus();
  }

  async refreshAwardTendersHistory(
    filters?: TedTenderSearchFilters,
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

    try {
      const result =
        await this.tedOpenTendersCollectorService.collectResultTendersFromTed(
          { lookbackYears: AWARD_TENDER_CONFIG.historyYearsBack, filters },
          {
            updateExisting: true,
            onProgress: (progress) => {
              status.pagesFetched = progress.pagesFetched;
              status.noticesFetched = progress.noticesFetched;
              status.totalNoticeCount = progress.totalNoticeCount;
            },
          },
        );

      status.pagesFetched = result.pagesFetched;
      status.noticesFetched = result.noticesFetched;
      status.totalNoticeCount = result.totalNoticeCount;
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      status.isRunning = false;
      status.finishedAt = new Date();
    }

    return this.getRefreshAwardTendersHistoryStatus();
  }
}
