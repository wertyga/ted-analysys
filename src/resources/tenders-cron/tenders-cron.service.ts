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

const RECENT_TENDERS_CRON = '0 1 * * *';
const ALL_COMPETITION_TENDERS_CRON = '0 3 * * *';
const RECENT_TENDERS_PAGE_LIMIT = 100;
const RECENT_TENDERS_MAX_PAGES = 100;

@Injectable()
export class TendersCronService {
  private readonly logger = new Logger(TendersCronService.name);

  private isGatheringRecentTenders = false;
  private isGatheringAllCompetitionTenders = false;

  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
    private readonly tenderMatchingService: TenderMatchingService,
    private readonly tenderMatchNotificationsService: TenderMatchNotificationsService,
  ) {}

  @Cron(ALL_COMPETITION_TENDERS_CRON, {
    timeZone: 'Europe/Warsaw',
  })
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

  @Cron(RECENT_TENDERS_CRON, {
    timeZone: 'Europe/Warsaw',
  })
  async gatherRecentCompetitionTenders(): Promise<void> {
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
