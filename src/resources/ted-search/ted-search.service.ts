import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
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
import { mapTedError, searchTendersDefaultFields } from './utils';
import { TenderModel } from '@/resources/tenders/schemas';
import { TendersService } from '@/resources/tenders/tenders.service';
import { devLog, getPaginationMeta } from '@/utils';
import { CurrencyExchangeRatesService } from '@/resources/currency-exchange-rates/currency-exchange-rates.service';

@Injectable()
export class TedSearchService {
  private readonly logger = new Logger(TedSearchService.name);
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

  constructor(
    @Inject(forwardRef(() => TendersService))
    private readonly tendersService: TendersService,
    private readonly currencyExchangeRatesService: CurrencyExchangeRatesService,
  ) {
    this.filters = new TedSearchFilters(this.currencyExchangeRatesService);
  }

  private readonly filters: TedSearchFilters;

  async searchNotices(dto: TedSearchRequestDto): Promise<TedSearchResponse> {
    return this.postWithRetry(dto);
  }

  async searchTenders(
    filters: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    return this.postWithRetry({
      query: buildTedTenderSearchQuery(filters),
      scope: filters.scope ?? TedScope.ACTIVE,
      limit: filters.limit ?? 20,
      page: filters.page ?? 1,
      paginationMode: TedPaginationMode.PAGE_NUMBER,
      onlyLatestVersions: true,
      checkQuerySyntax: false,
      fields: searchTendersDefaultFields,
    });
  }

  async searchLocalTenders(
    filters: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const { limit, skip } = getPaginationMeta({
      page: filters.page,
      limit: filters.limit,
    });
    const query = await this.filters.buildLocalTenderQuery(filters);
    const sort = this.sorting.buildLocalTenderSort(filters);

    devLog(
      () => `Local Search request: ${JSON.stringify(query)}`,
      TedSearchService.name,
    );

    const [notices, totalCount] = await Promise.all([
      this.tendersService.findMultipleLocalTendersWithBaseAnalysis(query, {
        sort,
        skip,
        limit,
      }),
      TenderModel.countDocuments(query).exec(),
    ]);

    return {
      notices: notices.map((notice) =>
        this.tendersService.toWholeTenderListDto(notice),
      ),
      totalNoticeCount: totalCount,
    };
  }

  private async postWithRetry(
    payload: TedSearchRequestDto,
  ): Promise<TedSearchResponse> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      try {
        devLog(
          () => `TED Search request: ${JSON.stringify(payload)}`,
          TedSearchService.name,
        );

        const response = await this.http.post<TedSearchResponse>(
          '/v3/notices/search',
          payload,
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
