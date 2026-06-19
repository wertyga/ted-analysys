import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderDocument } from '@/resources/tenders/schemas';
import { devLog, logger } from '@/utils';
import { TenderCompanyMatchDocument } from '@/resources/tender-matching/schemas/tender-company-match.schema';
import { TenderMatchingService } from '@/resources/tender-matching/tender-matching.service';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { TenderMatchSource } from '@/resources/tender-matching/tender-match.types';
import { TenderMatchNotificationsService } from '@/resources/tender-match-notifications/tender-match-notifications.service';
import { AwardTenderService } from '@/resources/award-tender/award-tender.service';
import { CRON_CONFIG } from '@/config/cron.config';
import { CronTaskQueueService } from '@/resources/cron/cron-task-queue/cron-task-queue.service';
import { TED_OPEN_TENDERS_COLLECTOR_CONFIG } from '@/config/ted-open-tenders-collector.config';

@Injectable()
export class TendersCronService {
  private readonly logger = new Logger(TendersCronService.name);

  private isGatheringRecentTenders = false;
  private isGatheringAllCompetitionTenders = false;
  private isGatheringRecentAwardTenders = false;

  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
    private readonly tenderMatchingService: TenderMatchingService,
    private readonly tenderMatchNotificationsService: TenderMatchNotificationsService,
    private readonly awardTenderService: AwardTenderService,
    private readonly cronTaskQueueService: CronTaskQueueService,
  ) {}

  getAllCompetitionTendersStatus(): { isRunning: boolean } {
    return { isRunning: this.isGatheringAllCompetitionTenders };
  }

  // @Cron(CRON_CONFIG.tenders.allCompetitionTenders, {
  //   timeZone: CRON_CONFIG.timeZone,
  // })
  async gatherAllCompetitionTenders(): Promise<void> {
    if (this.isGatheringAllCompetitionTenders) {
      this.logger.warn(
        'All competition TED tender gather is already running, skipping',
      );
      return;
    }

    this.isGatheringAllCompetitionTenders = true;

    try {
      let matchesSaved = 0;

      const result = await new TedOpenTendersCollectorService(
        this.tedSearchService,
        this.tendersService,
        this.awardTenderService,
      ).collectOpenTendersFromTed({
        onChangedTenders: async (tenders) => {
          const matches = await this.matchChangedTenders(tenders);

          matchesSaved += matches.length;
        },
      });

      await logger.info('TED_ALL_COMPETITION_COLLECTED', {
        ...result,
        matchesSaved,
      });

      await this.sendInstantTenderMatchReports();
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'unknown error';

      this.logger.error(`All competition TED tender gather failed: ${error}`);
      await logger.error('TED_ALL_COMPETITION_COLLECTED_FAILED', error);
    } finally {
      this.isGatheringAllCompetitionTenders = false;
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

    try {
      let matchesSaved = 0;

      const result = await new TedOpenTendersCollectorService(
        this.tedSearchService,
        this.tendersService,
        this.awardTenderService,
      ).collectRecentCompetitionTendersFromTed({
        onChangedTenders: async (tenders) => {
          const matches = await this.matchChangedTenders(tenders);

          matchesSaved += matches.length;
        },
      });
      const logResult = {
        ...result,
        matchesSaved,
      };

      devLog(
        `Recent TED tender gather completed: pages=${logResult.pagesFetched} fetched=${logResult.noticesFetched} saved=${logResult.saved} updated=${logResult.updated} skipped=${logResult.skipped} matches=${logResult.matchesSaved}`,
        TendersCronService.name,
      );

      await logger.info('TED_RECENT_COMPETITION_COLLECTED', logResult);

      await this.sendInstantTenderMatchReports();
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'unknown error';

      this.logger.error(`Recent TED tender gather failed: ${error}`);
      await logger.error('TED_RECENT_COMPETITION_COLLECTED_FAILED', error);
    } finally {
      this.isGatheringRecentTenders = false;
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

    try {
      const result = await new TedOpenTendersCollectorService(
        this.tedSearchService,
        this.tendersService,
        this.awardTenderService,
      ).collectResultTendersFromTed(
        {
          lookbackDays:
            TED_OPEN_TENDERS_COLLECTOR_CONFIG.recentResult.lookbackDays,
        },
        {},
      );

      devLog(
        `Recent TED award tender gather completed: pages=${result.pagesFetched} fetched=${result.noticesFetched} saved=${result.saved} updated=${result.updated} skipped=${result.skipped}`,
        TendersCronService.name,
      );

      await logger.info('TED_RECENT_AWARD_TENDERS_COLLECTED', result);
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'unknown error';

      this.logger.error(`Recent TED award tender gather failed: ${error}`);
      await logger.error('TED_RECENT_AWARD_TENDERS_COLLECTED_FAILED', error);
    } finally {
      this.isGatheringRecentAwardTenders = false;
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
