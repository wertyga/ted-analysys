import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import { buildTedTenderSearchQuery } from '@/resources/ted-search/ted-builders';
import {
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
} from '@/resources/ted-search/types/ted-search.types';
import { getTedDate } from '@/resources/ted-search/utils';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { TenderDocument } from '@/resources/tenders/schemas';
import { TendersService } from '@/resources/tenders/tenders.service';
import { isRecord } from '@/utils';

const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = 10000;

export interface TedOpenTendersCollectorOptions {
  pageLimit?: number;
  maxPages?: number;
  iterationNextToken?: string;
  onChangedTenders?: (tenders: TenderDocument[]) => Promise<void> | void;
}

export interface TedOpenTendersCollectorResult {
  pagesFetched: number;
  noticesFetched: number;
  saved: number;
  updated: number;
  skipped: number;
  totalNoticeCount?: number;
  resumeIterationNextToken?: string;
}

export class TedOpenTendersCollectorService {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
  ) {}

  async collectOpenTendersFromTed(
    options: TedOpenTendersCollectorOptions = {},
  ): Promise<TedOpenTendersCollectorResult> {
    const pageLimit = options.pageLimit ?? DEFAULT_PAGE_LIMIT;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

    const query = buildTedTenderSearchQuery({
      noticeTypes: TENDER_COMPETITION_NOTICE_TYPES,
      submissionDeadlineFrom: getTedDate(),
    });

    let iterationNextToken = options.iterationNextToken?.trim() || undefined;
    let pagesFetched = 0;
    let noticesFetched = 0;
    let saved = 0;
    let updated = 0;
    let skipped = 0;
    let totalNoticeCount: number | undefined;

    while (pagesFetched < maxPages) {
      const response = await this.tedSearchService.searchNotices({
        query,
        scope: TedScope.ACTIVE,
        limit: pageLimit,
        page: 1,
        paginationMode: TedPaginationMode.ITERATION,
        onlyLatestVersions: true,
        checkQuerySyntax: false,
        iterationNextToken,
        fields: this.tendersService.tenderDefaultFields,
      });
      const notices = this.tendersService.extractNotices(response);

      iterationNextToken = this.extractIterationNextToken(response);
      pagesFetched += 1;
      noticesFetched += notices.length;
      totalNoticeCount = this.extractTotalCount(response) ?? totalNoticeCount;

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

      if (!iterationNextToken) {
        break;
      }
    }

    return {
      pagesFetched,
      noticesFetched,
      saved,
      updated,
      skipped,
      totalNoticeCount,
      resumeIterationNextToken: iterationNextToken,
    };
  }

  private extractTotalCount(response: TedSearchResponse): number | undefined {
    if (typeof response.totalCount === 'number') {
      return response.totalCount;
    }

    if (typeof response.totalNoticeCount === 'number') {
      return response.totalNoticeCount;
    }

    const data = response.data;

    if (isRecord(data) && typeof data.totalCount === 'number') {
      return data.totalCount;
    }

    if (isRecord(data) && typeof data.totalNoticeCount === 'number') {
      return data.totalNoticeCount;
    }

    return undefined;
  }

  private extractIterationNextToken(
    response: TedSearchResponse,
  ): string | undefined {
    if (
      typeof response.iterationNextToken === 'string' &&
      response.iterationNextToken.trim().length > 0
    ) {
      return response.iterationNextToken;
    }

    if (
      typeof response.nextPageToken === 'string' &&
      response.nextPageToken.trim().length > 0
    ) {
      return response.nextPageToken;
    }

    const data = response.data;

    if (
      isRecord(data) &&
      typeof data.iterationNextToken === 'string' &&
      data.iterationNextToken.trim().length > 0
    ) {
      return data.iterationNextToken;
    }

    if (
      isRecord(data) &&
      typeof data.nextPageToken === 'string' &&
      data.nextPageToken.trim().length > 0
    ) {
      return data.nextPageToken;
    }

    return undefined;
  }
}
