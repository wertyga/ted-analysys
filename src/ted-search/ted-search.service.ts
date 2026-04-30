import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { TedSearchRequestDto } from './dto/ted-search-request.dto';
import { buildCpvQuery } from './ted-query.builder';
import {
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
} from './types/ted-search.types';
import {
  CpvCategory,
  CpvCategoryModel,
} from './schemas/cpv-category.schema';
import {
  CpvCategoriesResponse,
  CpvCategorySyncResult,
} from './types/cpv-category.types';

interface TedSearchOptions {
  scope?: TedScope;
  limit?: number;
  page?: number;
  countries?: string[];
}

interface TedRecentNoticesOptions {
  limit?: number;
  page?: number;
  scope?: TedScope;
}

@Injectable()
export class TedSearchService {
  private readonly logger = new Logger(TedSearchService.name);
  private readonly baseUrl: string;
  private readonly cpvCodelistUrl: string;
  private readonly retryDelaysMs = [500, 1500];

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('TED_API_BASE_URL') ??
      'https://api.ted.europa.eu';
    this.cpvCodelistUrl =
      this.configService.get<string>('CPV_CODELIST_URL') ??
      'https://docs.ted.europa.eu/eforms/latest/reference/code-lists/cpv.html';
  }
  
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

  async searchActiveItTenders(limit: number = 20): Promise<TedSearchResponse> {
    return this.searchByCpv(['72000000'], {
      scope: TedScope.ACTIVE,
      limit,
      page: 1,
    });
  }
  
  async searchByCpv(
    cpvCodes: string[],
    options: TedSearchOptions = {},
  ): Promise<TedSearchResponse> {
    if (options.countries?.length) {
      this.logger.warn(
        'Country filtering was requested but skipped because TED country expert-search field name must be verified.',
      );
    }
    
    return this.searchNotices({
      query: buildCpvQuery(cpvCodes),
      scope: options.scope ?? TedScope.ACTIVE,
      limit: options.limit ?? 20,
      page: options.page ?? 1,
      paginationMode: TedPaginationMode.PAGE_NUMBER,
      onlyLatestVersions: true,
      checkQuerySyntax: true,
      fields: this.defaultFields,
    });
  }
  
  async searchRecentNotices(
    options: TedRecentNoticesOptions = {},
  ): Promise<TedSearchResponse> {
    return this.searchNotices({
      query: 'publication-number = *',
      scope: options.scope ?? TedScope.LATEST,
      limit: options.limit ?? 20,
      page: options.page ?? 1,
      paginationMode: TedPaginationMode.PAGE_NUMBER,
      onlyLatestVersions: true,
      checkQuerySyntax: false,
      fields: this.defaultFields,
    });
  }

  async updateCpvCategories(): Promise<CpvCategorySyncResult> {
    const response = await axios.get<string>(this.cpvCodelistUrl, {
      timeout: 30000,
    });
    const syncedAt = new Date();
    const sourceVersion = this.parseCpvSourceVersion(response.data);
    const categories = this.parseCpvCategoriesFromHtml(
      response.data,
      syncedAt,
      sourceVersion,
    );

    if (categories.length === 0) {
      throw new ServiceUnavailableException(
        'CPV codelist source did not contain any categories',
      );
    }

    const existingCodes = new Set(categories.map((category) => category.code));
    const categoriesWithParents = categories.map((category) => ({
      ...category,
      parentCode: this.findCpvParentCode(category.code, existingCodes),
    }));

    const result = await CpvCategoryModel.bulkWrite(
      categoriesWithParents.map((category) => ({
        updateOne: {
          filter: { code: category.code },
          update: { $set: category },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return {
      source: this.cpvCodelistUrl,
      sourceVersion,
      fetchedCount: categoriesWithParents.length,
      insertedCount: result.insertedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
      matchedCount: result.matchedCount,
      syncedAt: syncedAt.toISOString(),
    };
  }

  async getCpvCategories(): Promise<CpvCategoriesResponse> {
    const categories = await CpvCategoryModel.find()
      .select('code name parentCode level -_id')
      .sort({ code: 1 })
      .lean();

    return {
      count: categories.length,
      items: categories.map((category) => ({
        code: category.code,
        name: category.name,
        parentCode: category.parentCode,
        level: category.level,
      })),
    };
  }
  
  private async postWithRetry(
    payload: TedSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/v3/notices/search`;
    const normalizedPayload = this.withDefaultFields(payload);
    
    let lastError: unknown;
    
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      try {
        this.logger.debug(
          `TED Search request: ${JSON.stringify(normalizedPayload)}`,
        );
        
        const response = await axios.post<TedSearchResponse>(
          url,
          normalizedPayload,
          {
            timeout: 30000,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          },
        );
        
        return response.data;
      } catch (error: any) {
        console.log({error: error.response});
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

  private parseCpvSourceVersion(html: string): string {
    const versionMatch = html.match(
      /Version\s*<\/td>\s*<td class="hdlist2">\s*<p>(\d{4})<\/p>/i,
    );

    return versionMatch?.[1] ?? '2008';
  }

  private parseCpvCategoriesFromHtml(
    html: string,
    syncedAt: Date,
    sourceVersion: string,
  ): CpvCategory[] {
    const codeLabelPattern =
      /<code>(\d{8})<\/code>[\s\S]*?<td class="hdlist2">\s*<p>(.*?)<\/p>/gis;
    const categories: CpvCategory[] = [];
    const seenCodes = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = codeLabelPattern.exec(html)) !== null) {
      const code = match[1];

      if (seenCodes.has(code)) {
        continue;
      }

      seenCodes.add(code);
      categories.push({
        code,
        name: this.decodeHtml(this.stripHtml(match[2])).trim(),
        level: this.getCpvCodeLevel(code),
        source: this.cpvCodelistUrl,
        sourceVersion,
        syncedAt,
      });
    }

    return categories;
  }

  private findCpvParentCode(
    code: string,
    existingCodes: Set<string>,
  ): string | undefined {
    for (
      let parentLevel = this.getCpvCodeLevel(code) - 1;
      parentLevel >= 2;
      parentLevel -= 1
    ) {
      const parentCode = code.slice(0, parentLevel).padEnd(8, '0');

      if (existingCodes.has(parentCode)) {
        return parentCode;
      }
    }

    return undefined;
  }

  private getCpvCodeLevel(code: string): number {
    const lastSignificantDigit = code.search(/0+$/);

    if (lastSignificantDigit === -1) {
      return code.length;
    }

    return Math.max(2, lastSignificantDigit);
  }

  private stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, '');
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }
}
