import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TedDeadlineRange } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import { TedScope } from '@/resources/ted-search/types/ted-search.types';
import { getTedDate, resolveDeadlineRange } from '@/resources/ted-search/utils';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import { isDev, logger } from '@/utils';
import { TenderCompanyMatchDocument } from '@/resources/tender-matching/schemas/tender-company-match.schema';
import { TenderMatchingService } from '@/resources/tender-matching/tender-matching.service';
import fs from 'node:fs';

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
    private readonly tenderMatchingService: TenderMatchingService,
  ) {
    // this.testFn();
  }

  async testFn() {
    const tender = await TenderModel.findOne({});
    await this.matchChangedTenders([tender as any]);

    console.log('DONE');
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
          `Recent TED tender gather completed: pages=${result.pagesFetched} fetched=${result.noticesFetched} saved=${result.saved} updated=${result.updated} skipped=${result.skipped} matches=${result.matchesSaved}`,
        );
      }
      logger.info(
        `Recent TED tender gather completed: pages=${result.pagesFetched} fetched=${result.noticesFetched} saved=${result.saved} updated=${result.updated} skipped=${result.skipped} matches=${result.matchesSaved}`,
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
    updated: number;
    skipped: number;
    matchesSaved: number;
    savedMatches: TenderCompanyMatchDocument[];
  }> {
    let page = 1;
    let pagesFetched = 0;
    let noticesFetched = 0;
    let saved = 0;
    let updated = 0;
    let skipped = 0;
    let matchesSaved = 0;
    const savedMatches: TenderCompanyMatchDocument[] = [];
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

      const pageMatches = await this.matchChangedTenders(
        saveResult.changedTenders,
      );

      savedMatches.push(...pageMatches);
      matchesSaved += pageMatches.length;

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
      matchesSaved,
      savedMatches,
    };
  }

  private async matchChangedTenders(
    tenders: TenderDocument[],
  ): Promise<TenderCompanyMatchDocument[]> {
    const matches = await Promise.all(
      tenders.map((tender) =>
        this.tenderMatchingService.matchTenderWithAllCompanyFilters(tender),
      ),
    );

    return matches.flat();
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
