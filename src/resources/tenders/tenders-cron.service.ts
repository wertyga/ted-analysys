import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TedDeadlineRange } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import { TedScope } from '@/resources/ted-search/types/ted-search.types';
import { getTedDate, resolveDeadlineRange } from '@/resources/ted-search/utils';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { isDev } from '@/utils';
import { TendersService } from './tenders.service';
import { logger } from '@/utils';

const RECENT_TENDERS_CRON = '0 1 * * *';
const RECENT_TENDERS_LOOKBACK_DAYS = 2;
const RECENT_TENDERS_PAGE_LIMIT = 100;
const RECENT_TENDERS_MAX_PAGES = 100;

@Injectable()
export class TendersCronService {
  private readonly logger = new Logger(TendersCronService.name);
  private isGatheringRecentTenders = false;

  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
  ) {
    setTimeout(() => {
      this.gatherRecentCompetitionTenders();
    }, 2000);
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
      const result = await this.gatherRecentCompetitionTendersOnce();

      if (isDev) {
        this.logger.log(
          `Recent TED tender gather completed: pages=${result.pagesFetched} fetched=${result.noticesFetched} saved=${result.saved} skipped=${result.skipped}`,
        );
      }
      logger.info(
        `Recent TED tender gather completed: pages=${result.pagesFetched} fetched=${result.noticesFetched} saved=${result.saved} skipped=${result.skipped}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Recent TED tender gather failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    } finally {
      this.isGatheringRecentTenders = false;
    }
  }

  private async gatherRecentCompetitionTendersOnce(): Promise<{
    pagesFetched: number;
    noticesFetched: number;
    saved: number;
    skipped: number;
  }> {
    let page = 1;
    let pagesFetched = 0;
    let noticesFetched = 0;
    let saved = 0;
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
      skipped += saveResult.skipped;

      if (
        totalNoticeCount !== undefined &&
        page * RECENT_TENDERS_PAGE_LIMIT >= totalNoticeCount
      ) {
        break;
      }

      page += 1;
    }

    return { pagesFetched, noticesFetched, saved, skipped };
  }

  private buildRecentCompetitionTenderFilters(page: number) {
    const today = new Date();
    const publicationDateFrom = new Date(today);
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
