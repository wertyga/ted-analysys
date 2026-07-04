import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TenderDocument } from '@/resources/tenders/schemas';
import { devLog, logger } from '@/utils';
import { TenderCompanyMatchDocument } from '@/resources/tender-matching/schemas/tender-company-match.schema';
import { TenderMatchingService } from '@/resources/tender-matching/tender-matching.service';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { TenderMatchSource } from '@/resources/tender-matching/tender-match.types';
import { TenderMatchNotificationsService } from '@/resources/tender-match-notifications/tender-match-notifications.service';
import { CRON_CONFIG } from '@/config/cron.config';
import { CronTaskQueueService } from '@/resources/cron/cron-task-queue/cron-task-queue.service';
import { TED_OPEN_TENDERS_COLLECTOR_CONFIG } from '@/config/ted-open-tenders-collector.config';

export type RecentCompetitionTendersStatus = {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  pagesFetched: number;
  noticesFetched: number;
  totalNoticeCount?: number;
  matchesSaved: number;
};

export type RecentAwardTendersStatus = {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  pagesFetched: number;
  noticesFetched: number;
  totalNoticeCount?: number;
};

export type AllCompetitionTendersStatus = {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  pagesFetched: number;
  noticesFetched: number;
  totalNoticeCount?: number;
};

const emptyRecentCompetitionTendersStatus =
  (): RecentCompetitionTendersStatus => ({
    isRunning: false,
    startedAt: null,
    finishedAt: null,
    lastError: null,
    pagesFetched: 0,
    noticesFetched: 0,
    matchesSaved: 0,
  });

const emptyRecentAwardTendersStatus = (): RecentAwardTendersStatus => ({
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  pagesFetched: 0,
  noticesFetched: 0,
});

const emptyAllCompetitionTendersStatus = (): AllCompetitionTendersStatus => ({
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  pagesFetched: 0,
  noticesFetched: 0,
});

@Injectable()
export class TendersCronService {
  private readonly logger = new Logger(TendersCronService.name);

  private isGatheringRecentTenders = false;
  private isGatheringAllCompetitionTenders = false;
  private isGatheringRecentAwardTenders = false;
  private recentCompetitionTendersStatus =
    emptyRecentCompetitionTendersStatus();
  private recentAwardTendersStatus = emptyRecentAwardTendersStatus();
  private allCompetitionTendersStatus = emptyAllCompetitionTendersStatus();

  constructor(
    private readonly tedOpenTendersCollectorService: TedOpenTendersCollectorService,
    private readonly tenderMatchingService: TenderMatchingService,
    private readonly tenderMatchNotificationsService: TenderMatchNotificationsService,
    private readonly cronTaskQueueService: CronTaskQueueService,
  ) {}

  getAllCompetitionTendersStatus(): AllCompetitionTendersStatus {
    return { ...this.allCompetitionTendersStatus };
  }

  getRecentCompetitionTendersStatus(): RecentCompetitionTendersStatus {
    return { ...this.recentCompetitionTendersStatus };
  }

  getRecentAwardTendersStatus(): RecentAwardTendersStatus {
    return { ...this.recentAwardTendersStatus };
  }

  // @Cron(CRON_CONFIG.tenders.allCompetitionTenders, {
  //   timeZone: CRON_CONFIG.timeZone,
  // })
  startGatherAllCompetitionTenders(options: {
    forceUpdate?: boolean;
    pageLimit?: number;
  } = {}): AllCompetitionTendersStatus {
    if (this.isGatheringAllCompetitionTenders) {
      return this.getAllCompetitionTendersStatus();
    }

    void this.gatherAllCompetitionTenders(options);

    return this.getAllCompetitionTendersStatus();
  }

  async gatherAllCompetitionTenders(
    optionsOrForceUpdate?: boolean | { forceUpdate?: boolean; pageLimit?: number },
  ): Promise<void> {
    if (this.isGatheringAllCompetitionTenders) {
      this.logger.warn(
        'All competition TED tender gather is already running, skipping',
      );
      return;
    }

    this.isGatheringAllCompetitionTenders = true;
    this.allCompetitionTendersStatus = {
      ...emptyAllCompetitionTendersStatus(),
      isRunning: true,
      startedAt: new Date(),
    };
    const status = this.allCompetitionTendersStatus;
    const options =
      typeof optionsOrForceUpdate === 'boolean'
        ? { forceUpdate: optionsOrForceUpdate }
        : (optionsOrForceUpdate ?? {});
    const pageLimit = options.pageLimit ? Number(options.pageLimit) : 70;

    try {
      const result =
        await this.tedOpenTendersCollectorService.collectOpenTendersFromTed({
        pageLimit,
        maxPages: 100_000,
        updateExisting: options.forceUpdate,
        onProgress: (progress) => {
          status.pagesFetched = progress.pagesFetched;
          status.noticesFetched = progress.noticesFetched;
          status.totalNoticeCount = progress.totalNoticeCount;
        },
      });
      status.pagesFetched = result.pagesFetched;
      status.noticesFetched = result.noticesFetched;
      status.totalNoticeCount = result.totalNoticeCount;
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'unknown error';

      status.lastError = error;
      this.logger.error(`All competition TED tender gather failed: ${error}`);
      await logger.error('TED_ALL_COMPETITION_COLLECTED_FAILED', error);
    } finally {
      this.isGatheringAllCompetitionTenders = false;
      status.isRunning = false;
      status.finishedAt = new Date();
    }
  }

  @Cron(CRON_CONFIG.tenders.recentTenders, {
    timeZone: CRON_CONFIG.timeZone,
  })
  async gatherRecentCompetitionTenders(): Promise<void> {
    await this.cronTaskQueueService.runExclusive(
      'gatherRecentCompetitionTenders',
      () => this.gatherRecentCompetitionTendersUnsafe(),
    );
  }

  private async gatherRecentCompetitionTendersUnsafe(): Promise<void> {
    if (this.isGatheringRecentTenders) {
      this.logger.warn('Recent TED tender gather is already running, skipping');
      return;
    }

    this.isGatheringRecentTenders = true;
    this.recentCompetitionTendersStatus = {
      ...emptyRecentCompetitionTendersStatus(),
      isRunning: true,
      startedAt: new Date(),
    };
    const status = this.recentCompetitionTendersStatus;

    try {
      const collectResult =
        await this.tedOpenTendersCollectorService.collectRecentCompetitionTendersFromTed(
          {
            maxPages: 100_000,
            pageLimit: 70,
            onProgress: (progress) => {
              status.pagesFetched = progress.pagesFetched;
              status.noticesFetched = progress.noticesFetched;
              status.totalNoticeCount = progress.totalNoticeCount;
            },
            onChangedTenders: async (tenders) => {
              const matches = await this.matchChangedTenders(tenders);

              status.matchesSaved += matches.length;
            },
          },
        );
      status.pagesFetched = collectResult.pagesFetched;
      status.noticesFetched = collectResult.noticesFetched;
      status.totalNoticeCount = collectResult.totalNoticeCount;
      const logResult = {
        pagesFetched: status.pagesFetched,
        noticesFetched: status.noticesFetched,
        totalNoticeCount: status.totalNoticeCount,
        matchesSaved: status.matchesSaved,
      };

      devLog(
        `Recent TED tender gather completed: fetched=${logResult.noticesFetched}/${logResult.totalNoticeCount ?? '?'} matches=${logResult.matchesSaved}`,
        TendersCronService.name,
      );

      await logger.info('TED_RECENT_COMPETITION_COLLECTED', logResult);

      await this.sendInstantTenderMatchReports();
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'unknown error';

      status.lastError = error;
      this.logger.error(`Recent TED tender gather failed: ${error}`);
      await logger.error('TED_RECENT_COMPETITION_COLLECTED_FAILED', error);
    } finally {
      this.isGatheringRecentTenders = false;
      status.isRunning = false;
      status.finishedAt = new Date();
    }
  }

  @Cron(CRON_CONFIG.tenders.recentAwardTenders, {
    timeZone: CRON_CONFIG.timeZone,
  })
  async gatherRecentAwardTenders(): Promise<void> {
    await this.cronTaskQueueService.runExclusive(
      'gatherRecentAwardTenders',
      () => this.gatherRecentAwardTendersUnsafe(),
    );
  }

  private async gatherRecentAwardTendersUnsafe(): Promise<void> {
    if (this.isGatheringRecentAwardTenders) {
      this.logger.warn(
        'Recent TED award tender gather is already running, skipping',
      );
      return;
    }

    this.isGatheringRecentAwardTenders = true;
    this.recentAwardTendersStatus = {
      ...emptyRecentAwardTendersStatus(),
      isRunning: true,
      startedAt: new Date(),
    };
    const status = this.recentAwardTendersStatus;

    try {
      const result =
        await this.tedOpenTendersCollectorService.collectResultTendersFromTed(
          {
            lookbackDays:
              TED_OPEN_TENDERS_COLLECTOR_CONFIG.recentResult.lookbackDays,
          },
          {
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

      devLog(
        `Recent TED award tender gather completed: pages=${result.pagesFetched} fetched=${result.noticesFetched}/${result.totalNoticeCount ?? '?'} `,
        TendersCronService.name,
      );

      await logger.info('TED_RECENT_AWARD_TENDERS_COLLECTED', result);
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'unknown error';

      status.lastError = error;
      this.logger.error(`Recent TED award tender gather failed: ${error}`);
      await logger.error('TED_RECENT_AWARD_TENDERS_COLLECTED_FAILED', error);
    } finally {
      this.isGatheringRecentAwardTenders = false;
      status.isRunning = false;
      status.finishedAt = new Date();
    }
  }

  private async matchChangedTenders(
    tenders: TenderDocument[],
  ): Promise<TenderCompanyMatchDocument[]> {
    const matches = await Promise.all(
      tenders.map((tender) =>
        this.tenderMatchingService.matchTenderWithAllCompanyFilters(
          tender,
          TenderMatchSource.TENDER_UPDATED,
        ),
      ),
    );

    return matches.flat();
  }

  private async sendInstantTenderMatchReports(): Promise<void> {
    await this.tenderMatchingService.waitForTenderCompanyAiFitQueueIdle();
    await this.tenderMatchNotificationsService.sendInstantReports();
  }
}
