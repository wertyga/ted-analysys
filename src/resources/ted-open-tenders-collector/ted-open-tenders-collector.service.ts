import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import {
  buildTedTenderSearchQuery,
  TedTenderSearchFilters,
} from '@/resources/ted-search/ted-builders';
import {
  TedDeadlineRange,
  TedTenderSearchRequestDto,
} from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import {
  TedNotice,
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
  TedSortOrder,
  TedTenderSortColumn,
} from '@/resources/ted-search/types/ted-search.types';
import { getTedDate } from '@/resources/ted-search/utils';
import {
  TENDER_COMPETITION_NOTICE_TYPES,
  TED_AWARD_TENDER_NOTICE_TYPES,
} from '@/resources/ted-search/utils/niticies';
import { TenderDocument } from '@/resources/tenders/schemas';
import { TendersService } from '@/resources/tenders/tenders.service';
import { isRecord } from '@/utils';
import { AwardTenderService } from '@/resources/award-tender/award-tender.service';
import { TED_OPEN_TENDERS_COLLECTOR_CONFIG } from '@/config/ted-open-tenders-collector.config';
import { AWARD_HISTORY_FIELDS } from '@/config/award-tender.config';
import { AwardTenderDocument } from '@/resources/award-tender/schemas';
import { TENDER_COMPETITION_SEARCH_FIELDS } from '@/config/ted-search.config';

export type TCollectOptions = {
  updateExisting?: boolean;
  pageLimit?: number;
  paginationMode?: TedPaginationMode;
};

export type TedOpenTendersCollectorOptions<TChangedTender = TenderDocument> =
  TCollectOptions & {
    maxPages?: number;
    iterationNextToken?: string;
    skipExistingByPublicationNumber?: boolean;
    onChangedTenders?: (tenders: TChangedTender[]) => Promise<void> | void;
    onProgress?: (
      progress: TedOpenTendersCollectorResult,
    ) => Promise<void> | void;
  };

export interface TedOpenTendersCollectorResult {
  pagesFetched: number;
  noticesFetched: number;
  totalNoticeCount?: number;
  resumeIterationNextToken?: string;
  stoppedReason?:
    | 'completed'
    | 'empty-page'
    | 'max-pages'
    | 'no-next-token'
    | 'search-window-limit';
}

interface TedNoticeBatchSaveResult {
  saved: number;
  updated?: number;
  skipped?: number;
}

interface TedIterationCollectorParams<TChangedTender = TenderDocument> {
  query: string;
  scope: TedScope;
  fields: string[];
  options: Pick<
    TedOpenTendersCollectorOptions<TChangedTender>,
    | 'pageLimit'
    | 'maxPages'
    | 'paginationMode'
    | 'iterationNextToken'
    | 'onProgress'
    | 'updateExisting'
    | 'skipExistingByPublicationNumber'
    | 'onChangedTenders'
  >;
  saveNotices: (notices: TedNotice[]) => Promise<void>;
}

@Injectable()
export class TedOpenTendersCollectorService {
  constructor(
    @Inject(forwardRef(() => TedSearchService))
    private readonly tedSearchService: TedSearchService,
    @Inject(forwardRef(() => TendersService))
    private readonly tendersService: TendersService,
    @Inject(forwardRef(() => AwardTenderService))
    private readonly awardTenderService: AwardTenderService,
  ) {}

  async collectAnyTendersFromTed(
    filters: TedTenderSearchRequestDto,
    fields: string[],
    options: TedIterationCollectorParams['options'] = {
      pageLimit: 100,
      maxPages: 100_000,
    },
    saveNotices: TedIterationCollectorParams['saveNotices'],
  ) {
    return this.collectTedNoticesByIteration<TenderDocument>({
      query: buildTedTenderSearchQuery(filters),
      scope: TedScope.ALL,
      fields,
      options,
      saveNotices,
    });
  }

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

  async collectResultTendersFromTed(
    {
      lookbackDays,
      lookbackYears,
      publicationDateFrom,
      publicationDateTo,
      filters,
    }: {
      lookbackDays?: number;
      lookbackYears?: number;
      publicationDateFrom?: string;
      publicationDateTo?: string;
      filters?: TedTenderSearchFilters;
    } = {},
    options: TedOpenTendersCollectorOptions<AwardTenderDocument> = {},
  ): Promise<TedOpenTendersCollectorResult> {
    const defaultPublicationDateFrom = new Date();

    if (lookbackDays) {
      defaultPublicationDateFrom.setDate(
        defaultPublicationDateFrom.getDate() - lookbackDays,
      );
    } else if (lookbackYears) {
      defaultPublicationDateFrom.setFullYear(
        defaultPublicationDateFrom.getFullYear() - lookbackYears,
      );
    }

    const queryPublicationDateFrom =
      publicationDateFrom ?? getTedDate(defaultPublicationDateFrom);
    const queryPublicationDateTo = publicationDateTo ?? getTedDate();

    const querySearch = buildTedTenderSearchQuery({
      ...(filters ?? {}),
      noticeTypes: TED_AWARD_TENDER_NOTICE_TYPES,
      publicationDateFrom: queryPublicationDateFrom,
      publicationDateTo: queryPublicationDateTo,
      winnerSelectionStatus: 'selec-w',
      sortColumn: TedTenderSortColumn.PUBLICATION_DATE,
      sortOrder: TedSortOrder.DESC,
    });

    return this.collectTedNoticesByIteration<AwardTenderDocument>({
      query: querySearch,
      scope: TedScope.ALL,
      fields: AWARD_HISTORY_FIELDS,
      options: {
        paginationMode: TedPaginationMode.PAGE_NUMBER,
        ...options,
      },
      saveNotices: async (notices) => {
        try {
          const saveResult = await this.awardTenderService.saveResultTedTenders(
            notices,
            {
              updateExisting: options.updateExisting,
              skipExistingByPublicationNumber:
                options.skipExistingByPublicationNumber,
            },
          );

          if (saveResult.changedTenders.length > 0) {
            await options.onChangedTenders?.(saveResult.changedTenders);
          }
        } catch (e) {
          console.log({ e });
        }
      },
    });
  }

  private async collectCompetitionTendersFromTed(
    query: string,
    options: TedOpenTendersCollectorOptions,
  ): Promise<TedOpenTendersCollectorResult> {
    return this.collectTedNoticesByIteration<TenderDocument>({
      query,
      scope: TedScope.ACTIVE,
      fields: TENDER_COMPETITION_SEARCH_FIELDS,
      options,
      saveNotices: async (notices) => {
        const saveResult = await this.tendersService.saveNewTedTenders(
          notices,
          !!options.updateExisting,
        );

        if (saveResult.changedTenders.length > 0) {
          await options.onChangedTenders?.(saveResult.changedTenders);
        }
      },
    });
  }

  private async collectTedNoticesByIteration<TChangedTender = TenderDocument>({
    query,
    scope,
    fields,
    options,
    saveNotices,
  }: TedIterationCollectorParams<TChangedTender>): Promise<TedOpenTendersCollectorResult> {
    const pageLimit =
      options.pageLimit ?? TED_OPEN_TENDERS_COLLECTOR_CONFIG.defaultPageLimit;
    const maxPages =
      options.maxPages ?? TED_OPEN_TENDERS_COLLECTOR_CONFIG.defaultMaxPages;
    const paginationMode =
      options.paginationMode ?? TedPaginationMode.ITERATION;
    let iterationNextToken = options.iterationNextToken?.trim() || undefined;
    let page = 1;
    let pagesFetched = 0;
    let noticesFetched = 0;
    let totalNoticeCount: number | undefined;
    let stoppedReason: TedOpenTendersCollectorResult['stoppedReason'] =
      'max-pages';

    while (pagesFetched < maxPages) {
      if (
        paginationMode === TedPaginationMode.PAGE_NUMBER &&
        page * pageLimit >
          TED_OPEN_TENDERS_COLLECTOR_CONFIG.maxPageNumberResultWindow
      ) {
        stoppedReason = 'search-window-limit';
        await options.onProgress?.({
          pagesFetched,
          noticesFetched,
          totalNoticeCount,
          resumeIterationNextToken: iterationNextToken,
          stoppedReason,
        });
        break;
      }

      const response = await this.tedSearchService.searchNotices({
        query,
        scope,
        limit: pageLimit,
        page,
        paginationMode,
        onlyLatestVersions: true,
        checkQuerySyntax: false,
        iterationNextToken:
          paginationMode === TedPaginationMode.ITERATION
            ? iterationNextToken
            : undefined,
        fields,
      });
      const notices = this.tendersService.extractNotices(response);

      iterationNextToken =
        paginationMode === TedPaginationMode.ITERATION
          ? this.extractIterationNextToken(response)
          : undefined;
      pagesFetched += 1;
      noticesFetched += notices.length;
      totalNoticeCount = this.extractTotalCount(response) ?? totalNoticeCount;

      if (notices.length === 0) {
        stoppedReason = 'empty-page';
        await options.onProgress?.({
          pagesFetched,
          noticesFetched,
          totalNoticeCount,
          resumeIterationNextToken: iterationNextToken,
          stoppedReason,
        });
        break;
      }

      await saveNotices(notices);

      await options.onProgress?.({
        pagesFetched,
        noticesFetched,
        totalNoticeCount,
        resumeIterationNextToken: iterationNextToken,
      });

      if (
        paginationMode === TedPaginationMode.PAGE_NUMBER &&
        totalNoticeCount !== undefined &&
        noticesFetched >= totalNoticeCount
      ) {
        stoppedReason = 'completed';
        break;
      }

      if (paginationMode === TedPaginationMode.PAGE_NUMBER) {
        page += 1;
        continue;
      }

      if (!iterationNextToken) {
        stoppedReason = 'completed';
        break;
      }
    }

    if (
      paginationMode === TedPaginationMode.ITERATION &&
      stoppedReason === 'completed' &&
      totalNoticeCount !== undefined &&
      noticesFetched < totalNoticeCount
    ) {
      stoppedReason = 'no-next-token';
    }

    return {
      pagesFetched,
      noticesFetched,
      totalNoticeCount,
      resumeIterationNextToken: iterationNextToken,
      stoppedReason,
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
