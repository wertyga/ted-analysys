import {
  mergeSearchPage,
  readPath,
  resolveSearchSources,
} from './ted.search.sources';
import { serializeNationalTenderList } from '@/resources/national-tenders/core/national-tender.serializer';
import {
  NationalTender,
  NationalTenderModel,
} from '@/resources/national-tenders/core/schemas/national-tender.schema';

/** Keeps the selected top-level fields (plus `source`) of a serialized record. */
function pickSelected<T extends object>(record: T, select: string | string[]) {
  const fields = (Array.isArray(select) ? select : select.split(/\s+/))
    .filter(Boolean)
    .map((field) => field.split('.')[0]);

  if (!fields.length) {
    return record;
  }

  const keep = new Set([...fields, 'source', 'sourceUrl', 'country']);

  return Object.fromEntries(
    Object.entries(record).filter(([key]) => keep.has(key)),
  ) as Partial<T>;
}

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
import { mapTedError } from './utils';
import { TenderModel } from '@/resources/tenders/schemas';
import { TendersService } from '@/resources/tenders/tenders.service';
import { devLog, getPaginationMeta } from '@/utils';
import { CurrencyExchangeRatesService } from '@/resources/currency-exchange-rates/currency-exchange-rates.service';
import { TENDER_COMPETITION_SEARCH_FIELDS } from '@/config/ted-search.config';
import { AWARD_HISTORY_FIELDS } from '@/config/award-tender.config';

const TENDER_PURE_LIST_SELECT = [
  '_id',
  'id',
  'noticeType',
  'noticeSubtype',
  'procedureType',
  'sourceHash',
  'title',
  'shortTitle',
  'description',
  'estimatedValue',
  'estimatedValueEur',
  'noticeLanguage',
  'submissionLanguages',
  'publicationDate',
  'submissionDeadline',
  'questionsDeadline',
  'plannedStartDate',
  'plannedEndDate',
  'contractNature',
  'electronicSubmission',
  'mainClassificationProc',
  'placeOfPerformanceCountries',
  'placeOfPerformanceCities',
  'placeOfPerformanceSubdivisions',
  'documentUrls',
  'euFundLot',
  'cpvCodes',
  'createdAt',
  'updatedAt',
  'nonLeadBuyers',
  'leadBuyers',
  'lots.identifier',
  'lots.isDps',
  'lots.isSME',
  'lots.isFrameworkAgreement',
];

export const TENDER_SEARCH_PURE_RESPONSE_SELECT = [
  '_id',
  'id',
  'title',
  'shortTitle',
  'submissionDeadline',
  'contractNature',
  'placeOfPerformanceCountries',
  'estimatedValue',
  'estimatedValueEur',
];

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
      fields: filters.awardFields
        ? AWARD_HISTORY_FIELDS
        : TENDER_COMPETITION_SEARCH_FIELDS,
    });
  }

  /**
   * TED tenders as lean records, national ones already serialized
   * (`NationalTenderListDto`, recognizable by `isNationalTenderId(id)`).
   */
  async searchTendersForPureList(
    filters: TedTenderSearchRequestDto,
    select: string | string[] = TENDER_PURE_LIST_SELECT,
  ) {
    const { limit, skip } = getPaginationMeta({
      page: filters.page,
      limit: filters.limit,
    });
    const sort = this.sorting.buildLocalTenderSort(filters);

    const query = await this.filters.buildLocalTenderQuery(filters);
    const sources = resolveSearchSources(filters.sources);

    if (sources.nationalSources.length) {
      const page = await this.pickMergedPage(query, sources, sort, skip, limit);
      const [tedTenders, nationalTenders] = await Promise.all([
        page.tedIds.length
          ? this.tendersService.findLocalTenders(
              { id: { $in: page.tedIds } },
              { select, isPure: true },
            )
          : [],
        NationalTenderModel.find({ id: { $in: page.nationalIds } })
          .lean<NationalTender[]>()
          .exec(),
      ]);
      const byId = new Map<string, unknown>([
        ...tedTenders.map((tender) => [tender.id, tender] as const),
        ...nationalTenders.map(
          (tender) =>
            [
              tender.id,
              pickSelected(serializeNationalTenderList(tender), select),
            ] as const,
        ),
      ]);

      return {
        tenders: page.order
          .map((id) => byId.get(id))
          .filter(Boolean) as typeof tedTenders,
        count: page.count,
      };
    }

    const [localTenders, count] = await Promise.all([
      this.tendersService.findLocalTenders(query, {
        sort,
        skip,
        limit,
        select,
        isPure: true,
      }),
      TenderModel.countDocuments(query),
    ]);

    return {
      tenders: localTenders,
      count: count,
    };
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
    const sources = resolveSearchSources(filters.sources);

    if (sources.nationalSources.length) {
      const page = await this.pickMergedPage(query, sources, sort, skip, limit);
      const [tedTenders, nationalTenders] = await Promise.all([
        page.tedIds.length
          ? this.tendersService.findMultipleLocalTendersWithBaseAnalysis(
              { id: { $in: page.tedIds } },
              {},
              filters.withoutBaseAnalysisGenerating,
            )
          : [],
        this.tendersService.findMultipleNationalTendersWithBaseAnalysis(
          page.nationalIds,
          filters.withoutBaseAnalysisGenerating,
        ),
      ]);
      const byId = new Map<string, unknown>([
        ...tedTenders.map(
          (tender) =>
            [
              tender.id,
              this.tendersService.toWholeTenderListDto(tender),
            ] as const,
        ),
        ...nationalTenders.map((tender) => [tender.id, tender] as const),
      ]);

      return {
        notices: page.order
          .map((id) => byId.get(id))
          .filter(Boolean) as TedSearchResponse['notices'],
        totalNoticeCount: page.count,
      };
    }

    devLog(
      `Local Search request: ${JSON.stringify(query)}`,
      TedSearchService.name,
    );

    const [notices, totalCount] = await Promise.all([
      this.tendersService.findMultipleLocalTendersWithBaseAnalysis(
        query,
        {
          sort,
          skip,
          limit,
        },
        filters.withoutBaseAnalysisGenerating,
      ),
      TenderModel.countDocuments(query).exec(),
    ]);

    return {
      notices: notices.map((notice) =>
        this.tendersService.toWholeTenderListDto(notice),
      ),
      totalNoticeCount: totalCount,
    };
  }

  /**
   * Page of ids across `tenders` and `national_tenders`: the first
   * `skip + limit` rows of each in the requested order, merged.
   */
  private async pickMergedPage(
    query: Record<string, unknown>,
    sources: ReturnType<typeof resolveSearchSources>,
    sort: Record<string, 1 | -1>,
    skip: number,
    limit: number,
  ) {
    const [field, direction] = Object.entries(sort)[0];
    const take = skip + limit;
    const nationalQuery = {
      $and: [query, { source: { $in: sources.nationalSources } }],
    };
    const projection = { id: 1, [field]: 1 };

    const [ted, national, tedCount, nationalCount] = await Promise.all([
      sources.includeTed
        ? TenderModel.find(query)
            .sort({ [field]: direction, _id: direction })
            .limit(take)
            .select(projection)
            .lean<{ id: string }[]>()
            .exec()
        : [],
      NationalTenderModel.find(nationalQuery)
        .sort({ [field]: direction, _id: direction })
        .limit(take)
        .select(projection)
        .lean<{ id: string }[]>()
        .exec(),
      sources.includeTed ? TenderModel.countDocuments(query).exec() : 0,
      NationalTenderModel.countDocuments(nationalQuery).exec(),
    ]);

    const toRow = (national: boolean) => (record: { id: string }) => ({
      id: record.id,
      national,
      value: readPath(record, field),
    });
    const rows = mergeSearchPage(
      ted.map(toRow(false)),
      national.map(toRow(true)),
      direction,
      skip,
      limit,
    );

    return {
      order: rows.map((row) => row.id),
      tedIds: rows.filter((row) => !row.national).map((row) => row.id),
      nationalIds: rows.filter((row) => row.national).map((row) => row.id),
      count: tedCount + nationalCount,
    };
  }

  private async postWithRetry(
    payload: TedSearchRequestDto,
  ): Promise<TedSearchResponse> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      try {
        devLog(
          `TED Search request: ${JSON.stringify(payload)}`,
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
