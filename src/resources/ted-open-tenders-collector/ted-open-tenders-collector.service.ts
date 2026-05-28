import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import { buildTedTenderSearchQuery } from '@/resources/ted-search/ted-builders';
import { TedDeadlineRange } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import {
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
  TedSortOrder,
  TedTenderSortColumn,
} from '@/resources/ted-search/types/ted-search.types';
import { getTedDate } from '@/resources/ted-search/utils';
import {
  TENDER_COMPETITION_NOTICE_TYPES,
  TENDER_RESULT_NOTICE_TYPES,
} from '@/resources/ted-search/utils/niticies';
import { TenderDocument } from '@/resources/tenders/schemas';
import { TendersService } from '@/resources/tenders/tenders.service';
import { isRecord } from '@/utils';
import { SimilarContractsService } from '@/resources/similar-contracts/similar-contracts.service';
import { searchTendersDefaultFields } from '@/resources/ted-search/utils';
import { winnerFields } from '@/resources/similar-contracts/similar-contracts.utils';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import { TED_OPEN_TENDERS_COLLECTOR_CONFIG } from '@/config/ted-open-tenders-collector.config';

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

interface TedNoticeBatchSaveResult {
  saved: number;
  updated?: number;
  skipped?: number;
}

interface TedIterationCollectorParams {
  query: string;
  scope: TedScope;
  fields: string[];
  options: TedOpenTendersCollectorOptions;
  saveNotices: (notices: TedNotice[]) => Promise<TedNoticeBatchSaveResult>;
}

export class TedOpenTendersCollectorService {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
    private readonly similarContractsService?: SimilarContractsService,
  ) {}

  async collectOpenTendersFromTed(
    options: TedOpenTendersCollectorOptions = {},
  ): Promise<TedOpenTendersCollectorResult> {
    const query = buildTedTenderSearchQuery({
      noticeTypes: TENDER_COMPETITION_NOTICE_TYPES,
      submissionDeadlineFrom: getTedDate(),
    });

    return this.collectCompetitionTendersFromTed(query, options);
  }

  async collectRecentCompetitionTendersFromTed(
    options: TedOpenTendersCollectorOptions = {},
  ): Promise<TedOpenTendersCollectorResult> {
    const publicationDateFrom = new Date();

    publicationDateFrom.setDate(
      publicationDateFrom.getDate() -
        TED_OPEN_TENDERS_COLLECTOR_CONFIG.recentCompetition.lookbackDays,
    );

    const query = buildTedTenderSearchQuery({
      noticeTypes: TENDER_COMPETITION_NOTICE_TYPES,
      publicationDateFrom: getTedDate(publicationDateFrom),
      publicationDateTo: getTedDate(),
      submissionDeadlineRange: TedDeadlineRange.ANY_OPEN,
    });

    return this.collectCompetitionTendersFromTed(query, options);
  }

  async collectResultTendersHistoryFromTed(
    options: TedOpenTendersCollectorOptions = {},
  ): Promise<TedOpenTendersCollectorResult> {
    if (!this.similarContractsService) {
      throw new Error('SimilarContractsService is required to collect results');
    }

    const publicationDateFrom = new Date();

    publicationDateFrom.setFullYear(
      publicationDateFrom.getFullYear() -
        TED_OPEN_TENDERS_COLLECTOR_CONFIG.historyResult.yearsBack,
    );

    const query = buildTedTenderSearchQuery({
      noticeTypes: TENDER_RESULT_NOTICE_TYPES,
      publicationDateFrom: getTedDate(publicationDateFrom),
      publicationDateTo: getTedDate(),
      winnerSelectionStatus: 'selec-w',
    });

    const searchOptions: TedOpenTendersCollectorOptions = {
      maxPages: TED_OPEN_TENDERS_COLLECTOR_CONFIG.historyResult.maxPages,
      pageLimit: TED_OPEN_TENDERS_COLLECTOR_CONFIG.historyResult.pageLimit,
    };

    return this.collectResultTendersFromTed(
      query,
      searchOptions,
      async (notices) => {
        const normalizedTenders = await Promise.all(
          notices.map((notice) => {
            return this.similarContractsService!.normalizeResultTender(notice);
          }),
        );

        const saveResult = await Promise.all(
          normalizedTenders.map((tender) =>
            this.similarContractsService!.upsertAwardTender(tender),
          ),
        );

        if (saveResult.length > 0) {
          await options.onChangedTenders?.(saveResult);
        }

        return {
          saved: saveResult.length,
          updated: 0,
          skipped: 0,
        };
      },
    );
  }

  private async collectCompetitionTendersFromTed(
    query: string,
    options: TedOpenTendersCollectorOptions,
  ): Promise<TedOpenTendersCollectorResult> {
    return this.collectTedNoticesByIteration({
      query,
      scope: TedScope.ACTIVE,
      fields: searchTendersDefaultFields,
      options,
      saveNotices: async (notices) => {
        const saveResult = await this.tendersService.saveNewTedTenders(notices);

        if (saveResult.changedTenders.length > 0) {
          await options.onChangedTenders?.(saveResult.changedTenders);
        }

        return saveResult;
      },
    });
  }

  private async collectResultTendersFromTed(
    query: string,
    options: TedOpenTendersCollectorOptions,
    saveNotices: TedIterationCollectorParams['saveNotices'],
  ): Promise<TedOpenTendersCollectorResult> {
    if (!this.similarContractsService) {
      throw new Error('SimilarContractsService is required to collect results');
    }

    return this.collectTedNoticesByIteration({
      query,
      scope: TedScope.ALL,
      fields: [...searchTendersDefaultFields, ...winnerFields],
      options,
      saveNotices,
    });
  }

  private async collectTedNoticesByIteration({
    query,
    scope,
    fields,
    options,
    saveNotices,
  }: TedIterationCollectorParams): Promise<TedOpenTendersCollectorResult> {
    const pageLimit =
      options.pageLimit ?? TED_OPEN_TENDERS_COLLECTOR_CONFIG.defaultPageLimit;
    const maxPages =
      options.maxPages ?? TED_OPEN_TENDERS_COLLECTOR_CONFIG.defaultMaxPages;
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
        scope,
        limit: pageLimit,
        page: 1,
        paginationMode: TedPaginationMode.ITERATION,
        onlyLatestVersions: true,
        checkQuerySyntax: false,
        iterationNextToken,
        fields,
      });
      const notices = this.tendersService.extractNotices(response);

      iterationNextToken = this.extractIterationNextToken(response);
      pagesFetched += 1;
      noticesFetched += notices.length;
      totalNoticeCount = this.extractTotalCount(response) ?? totalNoticeCount;

      if (notices.length === 0) {
        break;
      }

      const saveResult = await saveNotices(notices);
      saved += saveResult.saved;
      updated += saveResult.updated ?? 0;
      skipped += saveResult.skipped ?? 0;

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
