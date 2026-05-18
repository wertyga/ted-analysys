import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TedDeadlineRange } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import { TedScope } from '@/resources/ted-search/types/ted-search.types';
import { getTedDate, resolveDeadlineRange } from '@/resources/ted-search/utils';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderDocument } from '@/resources/tenders/schemas';
import { devLog, logger } from '@/utils';
import { TenderCompanyMatchDocument } from '@/resources/tender-matching/schemas/tender-company-match.schema';
import { TenderMatchingService } from '@/resources/tender-matching/tender-matching.service';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { TenderMatchSource } from '@/resources/tender-matching/tender-match.types';

const RECENT_TENDERS_CRON = '0 1 * * *';
const ALL_COMPETITION_TENDERS_CRON = '0 3 * * *';
const RECENT_TENDERS_LOOKBACK_DAYS = 2;
const RECENT_TENDERS_PAGE_LIMIT = 100;
const RECENT_TENDERS_MAX_PAGES = 100;

interface GatherRecentCompetitionTendersOptions {
  onChangedTenders?: (tenders: TenderDocument[]) => Promise<void> | void;
}

interface GatherRecentCompetitionTendersResult {
  pagesFetched: number;
  noticesFetched: number;
  saved: number;
  updated: number;
  skipped: number;
}

@Injectable()
export class TendersCronService {
  private readonly logger = new Logger(TendersCronService.name);

  private isGatheringRecentTenders = false;
  private isGatheringAllCompetitionTenders = false;

  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
    private readonly tenderMatchingService: TenderMatchingService,
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

      const result = await this.gatherRecentCompetitionTendersOnce({
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
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'unknown error';

      this.logger.error(`Recent TED tender gather failed: ${error}`);
      await logger.error('TED_RECENT_COMPETITION_COLLECTED_FAILED', error);
    } finally {
      this.isGatheringRecentTenders = false;
    }
  }

  private async gatherRecentCompetitionTendersOnce(
    options: GatherRecentCompetitionTendersOptions = {},
  ): Promise<GatherRecentCompetitionTendersResult> {
    let page = 1;
    let pagesFetched = 0;
    let noticesFetched = 0;
    let saved = 0;
    let updated = 0;
    let skipped = 0;
    let totalNoticeCount: number | undefined;

    while (page <= RECENT_TENDERS_MAX_PAGES) {
      const response = await this.tedSearchService.searchTenders(
        this.buildRecentCompetitionTenderFilters(page),
      );

      const notices = this.tendersService.extractNotices(response);

      pagesFetched += 1;
      noticesFetched += notices.length;
      totalNoticeCount = response.totalNoticeCount ?? totalNoticeCount;

      if (notices.length === 0) {
        break;
      }

      const saveResult = await this.tendersService.saveNewTedTenders(notices);
      saved += saveResult.saved;
      updated += saveResult.updated;
      skipped += saveResult.skipped;

      if (saveResult.changedTenders.length > 0) {
        await options.onChangedTenders?.(saveResult.changedTenders);
      }

      if (
        totalNoticeCount !== undefined &&
        page * RECENT_TENDERS_PAGE_LIMIT >= totalNoticeCount
      ) {
        break;
      }

      page += 1;
    }

    return {
      pagesFetched,
      noticesFetched,
      saved,
      updated,
      skipped,
    };
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

  private buildRecentCompetitionTenderFilters(page: number) {
    const today = new Date();
    const publicationDateFrom = new Date();

    publicationDateFrom.setDate(
      publicationDateFrom.getDate() - RECENT_TENDERS_LOOKBACK_DAYS,
    );

    return resolveDeadlineRange({
      noticeTypes: TENDER_COMPETITION_NOTICE_TYPES,
      publicationDateFrom: getTedDate(publicationDateFrom),
      publicationDateTo: getTedDate(today),
      submissionDeadlineRange: TedDeadlineRange.ANY_OPEN,
      scope: TedScope.ACTIVE,
      limit: RECENT_TENDERS_PAGE_LIMIT,
      page,
    });
  }
}
