import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TenderDocument } from '@/resources/tenders/schemas';
import { TenderModel } from '@/resources/tenders/schemas';
import { devLog, logger } from '@/utils';
import { TenderCompanyMatchDocument } from '@/resources/tender-matching/schemas/tender-company-match.schema';
import { TenderMatchingService } from '@/resources/tender-matching/tender-matching.service';
import {
  TCollectOptions,
  TedOpenTendersCollectorService,
} from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { TenderMatchSource } from '@/resources/tender-matching/tender-match.types';
import { TenderMatchNotificationsService } from '@/resources/tender-match-notifications/tender-match-notifications.service';
import { CRON_CONFIG } from '@/config/cron.config';
import { CronTaskQueueService } from '@/resources/cron/cron-task-queue/cron-task-queue.service';
import { TED_OPEN_TENDERS_COLLECTOR_CONFIG } from '@/config/ted-open-tenders-collector.config';
import { TedPaginationMode } from '@/resources/ted-search/types/ted-search.types';
import { BuyerService } from '@/resources/buyer/buyer.service';

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

export type ExpiredCompetitionTenderBuyerMetaStatus = {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  expiredTenders: number;
  buyerIdsFound: number;
  buyersUpdated: number;
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

const emptyExpiredCompetitionTenderBuyerMetaStatus =
  (): ExpiredCompetitionTenderBuyerMetaStatus => ({
    isRunning: false,
    startedAt: null,
    finishedAt: null,
    lastError: null,
    expiredTenders: 0,
    buyerIdsFound: 0,
    buyersUpdated: 0,
  });

@Injectable()
export class TendersCronService {
  private readonly logger = new Logger(TendersCronService.name);

  private isGatheringRecentTenders = false;
  private isGatheringAllCompetitionTenders = false;
  private isGatheringRecentAwardTenders = false;
  private isRefreshingExpiredCompetitionTenderBuyerMeta = false;
  private recentCompetitionTendersStatus =
    emptyRecentCompetitionTendersStatus();
  private recentAwardTendersStatus = emptyRecentAwardTendersStatus();
  private allCompetitionTendersStatus = emptyAllCompetitionTendersStatus();
  private expiredCompetitionTenderBuyerMetaStatus =
    emptyExpiredCompetitionTenderBuyerMetaStatus();

  constructor(
    private readonly tedOpenTendersCollectorService: TedOpenTendersCollectorService,
    private readonly tenderMatchingService: TenderMatchingService,
    private readonly tenderMatchNotificationsService: TenderMatchNotificationsService,
    private readonly cronTaskQueueService: CronTaskQueueService,
    private readonly buyerService: BuyerService,
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

  getExpiredCompetitionTenderBuyerMetaStatus(): ExpiredCompetitionTenderBuyerMetaStatus {
    return { ...this.expiredCompetitionTenderBuyerMetaStatus };
  }

  // @Cron(CRON_CONFIG.tenders.allCompetitionTenders, {
  //   timeZone: CRON_CONFIG.timeZone,
  // })
  startGatherAllCompetitionTenders(
    options: TCollectOptions = {},
  ): AllCompetitionTendersStatus {
    if (this.isGatheringAllCompetitionTenders) {
      return this.getAllCompetitionTendersStatus();
    }

    void this.gatherAllCompetitionTenders(options);

    return this.getAllCompetitionTendersStatus();
  }

  async gatherAllCompetitionTenders(options?: TCollectOptions): Promise<void> {
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

    try {
      const result =
        await this.tedOpenTendersCollectorService.collectOpenTendersFromTed({
          paginationMode: TedPaginationMode.PAGE_NUMBER,
          ...(options ?? {}),
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
    name: 'gather-recent-competition-tenders',
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

  @Cron(CRON_CONFIG.tenders.expiredCompetitionTenderBuyerMeta, {
    name: 'refresh-expired-competition-tender-buyer-meta',
    timeZone: CRON_CONFIG.timeZone,
  })
  async refreshExpiredCompetitionTenderBuyerMeta(): Promise<void> {
    await this.cronTaskQueueService.runExclusive(
      'refreshExpiredCompetitionTenderBuyerMeta',
      () => this.refreshExpiredCompetitionTenderBuyerMetaUnsafe(),
    );
  }

  private async refreshExpiredCompetitionTenderBuyerMetaUnsafe(): Promise<void> {
    if (this.isRefreshingExpiredCompetitionTenderBuyerMeta) {
      this.logger.warn(
        'Expired competition tender buyer meta refresh is already running, skipping',
      );
      return;
    }

    this.isRefreshingExpiredCompetitionTenderBuyerMeta = true;
    this.expiredCompetitionTenderBuyerMetaStatus = {
      ...emptyExpiredCompetitionTenderBuyerMetaStatus(),
      isRunning: true,
      startedAt: new Date(),
    };
    const status = this.expiredCompetitionTenderBuyerMetaStatus;
    const deadlineTo = new Date();
    const deadlineFrom = new Date(deadlineTo);
    deadlineFrom.setDate(deadlineFrom.getDate() - 2);

    try {
      const expiredTenders = await TenderModel.find({
        submissionDeadline: {
          $gte: deadlineFrom,
          $lt: deadlineTo,
        },
      })
        .select('leadBuyers nonLeadBuyers')
        .lean();
      const buyerIds = Array.from(
        new Set(
          expiredTenders
            .flatMap((tender) => [
              ...(tender.leadBuyers ?? []),
              ...(tender.nonLeadBuyers ?? []),
            ])
            .map((buyerId) => buyerId.toString()),
        ),
      );

      status.expiredTenders = expiredTenders.length;
      status.buyerIdsFound = buyerIds.length;

      const updatedBuyers =
        await this.buyerService.refreshBuyersTenderMeta(buyerIds);
      status.buyersUpdated = updatedBuyers.length;

      await logger.info('TED_EXPIRED_COMPETITION_BUYER_META_REFRESHED', {
        expiredTenders: status.expiredTenders,
        buyerIdsFound: status.buyerIdsFound,
        buyersUpdated: status.buyersUpdated,
      });
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'unknown error';

      status.lastError = error;
      this.logger.error(
        `Expired competition tender buyer meta refresh failed: ${error}`,
      );
      await logger.error(
        'TED_EXPIRED_COMPETITION_BUYER_META_REFRESH_FAILED',
        error,
      );
    } finally {
      this.isRefreshingExpiredCompetitionTenderBuyerMeta = false;
      status.isRunning = false;
      status.finishedAt = new Date();
    }
  }

  @Cron(CRON_CONFIG.tenders.recentAwardTenders, {
    name: 'gather-recent-award-tenders',
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
