import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { PipelineStage } from 'mongoose';
import { TedSearchRequestDto } from './dto/ted-search-request.dto';
import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { buildTedTenderSearchQuery } from './ted-builders';
import { TedSearchFilters } from './ted.search.filters';
import { TedSearchSorting } from './ted.search.sorting';
import {
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
} from './types/ted-search.types';
import { mapTedError, resolveDeadlineRange } from './utils';
import { TenderGeneralAnalysisModel } from '@/resources/tender-analysis/schemas';
import { TenderModel } from '@/resources/tenders/schemas';

@Injectable()
export class TedSearchService {
  private readonly logger = new Logger(TedSearchService.name);
  private readonly filters = new TedSearchFilters();
  private readonly sorting = new TedSearchSorting();
  private readonly baseUrl = 'https://api.ted.europa.eu';
  private readonly http: AxiosInstance = axios.create({
    baseURL: this.baseUrl,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  private readonly retryDelaysMs = [500, 1500];
  private readonly rateLimitRetryDelayMs = 30000;

  private readonly searchTendersDefaultFields = [
    'notice-identifier',
    'publication-number',
    'notice-type',
    'notice-subtype',
    'notice-version',
    'notice-title',
    'publication-date',
    'dispatch-date',
    'deadline',
    'deadline-receipt-tender-date-lot',
    'deadline-receipt-tender-time-lot',
    'deadline-receipt-answers-date-lot',
    'deadline-receipt-answers-time-lot',
    'title-proc',
    'title-lot',
    'description-proc',
    'description-lot',
    'procedure-type',
    'contract-nature',
    'legal-basis',
    'classification-cpv',
    'main-classification-proc',
    'main-classification-lot',
    'additional-classification-lot',
    'buyer-name',
    'buyer-identifier',
    'buyer-country',
    'buyer-city',
    'buyer-email',
    'buyer-internet-address',
    'buyer-profile',
    'estimated-value-proc',
    'estimated-value-cur-proc',
    'estimated-value-lot',
    'estimated-value-cur-lot',
    'place-of-performance-country-proc',
    'place-of-performance-country-lot',
    'place-of-performance-city-proc',
    'place-of-performance-city-lot',
    'identifier-lot',
    'internal-identifier-lot',
    'links',
    'document-url-lot',
    'submission-url-lot',
    'electronic-submission-lot',
    'submission-language',
    'official-language',
    'contract-duration-start-date-lot',
    'contract-duration-end-date-lot',
    'duration-period-value-lot',
    'duration-period-unit-lot',
    'sme-lot',
    'framework-agreement-lot',
    'dps-usage-lot',
    'eu-fund-lot',
    'selection-criterion-name-lot',
    'selection-criterion-description-lot',
    'award-criterion-name-lot',
    'award-criterion-description-lot',
    'award-criterion-type-lot',
    'award-criterion-number-weight-lot',
  ];

  private withDefaultFields({
    fields = [],
    ...payload
  }: TedSearchRequestDto): TedSearchRequestDto {
    return {
      ...payload,
      fields: Array.from(
        new Set([...fields, ...this.searchTendersDefaultFields]),
      ),
    };
  }

  async searchNotices(dto: TedSearchRequestDto): Promise<TedSearchResponse> {
    return this.postWithRetry(dto);
  }

  async searchTenders(
    filters: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    return this.searchNotices({
      query: buildTedTenderSearchQuery(filters),
      scope: filters.scope ?? TedScope.ACTIVE,
      limit: filters.limit ?? 20,
      page: filters.page ?? 1,
      paginationMode: TedPaginationMode.PAGE_NUMBER,
      onlyLatestVersions: true,
      checkQuerySyntax: false,
      fields: this.searchTendersDefaultFields,
    });
  }

  async searchLocalTenders(
    filters: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const limit = filters.limit ?? 20;
    const page = filters.page ?? 1;
    const query = this.filters.buildLocalTenderQuery(filters);
    const sort = this.sorting.buildLocalTenderSort(filters);
    const skip = (page - 1) * limit;

    this.logger.debug(`Local Search request: ${JSON.stringify(query)}`);

    const opportunityScoreQuery =
      this.filters.buildOpportunityScoreQuery(filters);

    if (opportunityScoreQuery) {
      return this.searchLocalTendersByAnalysisScore({
        tenderQuery: query,
        opportunityScoreQuery,
        sort,
        skip,
        limit,
      });
    }

    const [notices, totalCount] = await Promise.all([
      TenderModel.find(query).sort(sort).skip(skip).limit(limit).lean().exec(),
      TenderModel.countDocuments(query).exec(),
    ]);

    return {
      notices,
      totalNoticeCount: totalCount,
    };
  }

  private async searchLocalTendersByAnalysisScore({
    tenderQuery,
    opportunityScoreQuery,
    sort,
    skip,
    limit,
  }: {
    tenderQuery: Record<string, unknown>;
    opportunityScoreQuery: Record<string, unknown>;
    sort: Record<string, 1 | -1>;
    skip: number;
    limit: number;
  }): Promise<TedSearchResponse> {
    const pipeline: PipelineStage[] = [
      { $match: opportunityScoreQuery },
      {
        $lookup: {
          from: 'tenders',
          localField: 'tender',
          foreignField: '_id',
          as: 'tender',
        },
      },
      { $unwind: '$tender' },
      { $replaceRoot: { newRoot: '$tender' } },
      { $match: tenderQuery },
      {
        $facet: {
          notices: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    ];
    const [result] = await TenderGeneralAnalysisModel.aggregate<{
      notices: TedSearchResponse['notices'];
      total: { count: number }[];
    }>(pipeline).exec();
    const totalCount = result?.total[0]?.count ?? 0;

    return {
      notices: result?.notices ?? [],
      totalNoticeCount: totalCount,
    };
  }

  private async postWithRetry(
    payload: TedSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const normalizedPayload = this.withDefaultFields({ ...payload });
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      try {
        this.logger.debug(
          `TED Search request: ${JSON.stringify(normalizedPayload)}`,
        );

        const response = await this.http.post<TedSearchResponse>(
          '/v3/notices/search',
          normalizedPayload,
        );

        return response.data;
      } catch (error: unknown) {
        lastError = error;

        if (this.isAxiosError(error)) {
          this.logger.warn(
            `TED Search failed: status=${error.response?.status ?? 'network'} data=${JSON.stringify(
              error.response?.data ?? {},
            )}`,
          );
        }

        if (!this.shouldRetry(error) || attempt === this.retryDelaysMs.length) {
          break;
        }

        const delayMs = this.getRetryDelayMs(error, attempt);
        this.logger.warn(`Retrying TED Search request in ${delayMs}ms`);
        await this.delay(delayMs);
      }
    }

    throw mapTedError(lastError, this.logger, (error) =>
      this.isAxiosError(error),
    );
  }

  private shouldRetry(error: unknown): boolean {
    if (!this.isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;
    return status === undefined || status === 429 || status >= 500;
  }

  private getRetryDelayMs(error: unknown, attempt: number): number {
    if (this.isAxiosError(error) && error.response?.status === 429) {
      return this.rateLimitRetryDelayMs;
    }

    return this.retryDelaysMs[attempt];
  }

  private isAxiosError(error: unknown): error is AxiosError {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as AxiosError).isAxiosError === true
    );
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
