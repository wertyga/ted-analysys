import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { TedSearchRequestDto } from './dto/ted-search-request.dto';
import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { buildTedTenderSearchQuery, normalizeCpvCodes } from './ted-builders';
import {
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
} from './types/ted-search.types';
import { TENDER_COMPETITION_NOTICE_TYPES } from './utils/niticies';

interface TedSearchOptions {
  scope?: TedScope;
  limit?: number;
  page?: number;
  countries?: string[];
}

@Injectable()
export class TedSearchService {
  private readonly logger = new Logger(TedSearchService.name);
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

  private readonly defaultFields = [
    'publication-number',
    'notice-title',
    'publication-date',
    'deadline',
    'classification-cpv',
    'buyer-name',
    'buyer-country',
    'notice-type',
  ];

  private withDefaultFields(payload: TedSearchRequestDto): TedSearchRequestDto {
    return {
      ...payload,
      fields:
        Array.isArray(payload.fields) && payload.fields.length > 0
          ? payload.fields
          : this.defaultFields,
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
      fields: this.defaultFields,
    });
  }

  async searchByCpv(
    cpvCodes: string[],
    options: TedSearchOptions = {},
  ): Promise<TedSearchResponse> {
    const normalizedCpvCodes = normalizeCpvCodes(cpvCodes);

    if (normalizedCpvCodes.length === 0) {
      throw new BadRequestException(
        'At least one valid 8-digit CPV code is required',
      );
    }

    if (options.countries?.length) {
      this.logger.warn(
        'Country filtering was requested but skipped because TED country expert-search field name must be verified.',
      );
    }

    return this.searchNotices({
      query: buildTedTenderSearchQuery({
        cpvCodes: normalizedCpvCodes,
        noticeTypes: TENDER_COMPETITION_NOTICE_TYPES,
      }),
      scope: options.scope ?? TedScope.ACTIVE,
      limit: options.limit ?? 20,
      page: options.page ?? 1,
      paginationMode: TedPaginationMode.PAGE_NUMBER,
      onlyLatestVersions: true,
      checkQuerySyntax: false,
      fields: this.defaultFields,
    });
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

        await this.delay(this.retryDelaysMs[attempt]);
      }
    }

    throw this.mapTedError(lastError);
  }

  private shouldRetry(error: unknown): boolean {
    if (!this.isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;
    return status === undefined || status >= 500;
  }

  private mapTedError(error: unknown): HttpException {
    if (this.isAxiosError(error)) {
      const status = error.response?.status;

      this.logger.error(
        `TED Search API request failed: status=${status ?? 'network'} code=${
          error.code ?? 'unknown'
        }`,
      );

      if (status === 400) {
        return new BadRequestException(
          'TED query syntax is invalid or request body is not accepted',
        );
      }

      if (status === 429) {
        return new HttpException('TED API rate limit exceeded', 429);
      }

      if (status === undefined) {
        return new ServiceUnavailableException('TED API is unavailable');
      }

      if (status !== undefined && status >= 500) {
        return new ServiceUnavailableException(
          'TED API is temporarily unavailable',
        );
      }
    } else {
      this.logger.error('TED Search API request failed with a non-Axios error');
    }

    return new InternalServerErrorException(
      'TED API request failed unexpectedly',
    );
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
