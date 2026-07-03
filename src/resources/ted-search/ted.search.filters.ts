import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { CurrencySign, normalizeTedCountryCodes } from '@/resources/codelist';
import {
  getNarrowerCodes,
  normalizeCpvCodes,
} from './ted-builders/ted-cpv.builder';
import { resolveDeadlineRange } from './utils';
import { CurrencyExchangeRatesService } from '@/resources/currency-exchange-rates/currency-exchange-rates.service';

type MongoFilter = Record<string, unknown>;

export class TedSearchFilters {
  constructor(
    private readonly currencyExchangeRatesService: CurrencyExchangeRatesService,
  ) {}

  async buildLocalTenderQuery(
    filters: TedTenderSearchRequestDto,
  ): Promise<MongoFilter> {
    const resolvedFilters = resolveDeadlineRange(filters);
    const parts: MongoFilter[] = [];

    if (resolvedFilters.text?.trim()) {
      parts.push({
        $or: [
          { title: this.buildTextRegex(resolvedFilters.text) },
          { titleProc: this.buildTextRegex(resolvedFilters.text) },
          { 'lots.title': this.buildTextRegex(resolvedFilters.text) },
          { description: this.buildTextRegex(resolvedFilters.text) },
          { 'lots.description': this.buildTextRegex(resolvedFilters.text) },
          { id: this.buildTextRegex(resolvedFilters.text) },
        ],
      });
    }

    const cpvCodes = getNarrowerCodes(
      normalizeCpvCodes(resolvedFilters.cpvCodes ?? []),
    );

    if (cpvCodes.length) {
      parts.push({ cpvCodes: { $in: cpvCodes } });
    }

    const placeOfPerformance = normalizeTedCountryCodes(
      resolvedFilters.placeOfPerformance,
    );

    if (placeOfPerformance.length) {
      parts.push({
        placeOfPerformanceCountries: { $in: placeOfPerformance },
      });
    }

    if (resolvedFilters.submissionLanguage?.length) {
      parts.push({
        submissionLanguages: { $in: resolvedFilters.submissionLanguage },
      });
    }

    if (resolvedFilters.noticeTypes?.length) {
      parts.push({ noticeType: { $in: resolvedFilters.noticeTypes } });
    }

    if (resolvedFilters.procedureType?.length) {
      parts.push({ procedureType: { $in: resolvedFilters.procedureType } });
    }

    if (resolvedFilters.contractNature?.length) {
      parts.push({ contractNature: { $in: resolvedFilters.contractNature } });
    }

    const contractAwardFilter =
      await this.buildContractAwardFilter(resolvedFilters);

    if (contractAwardFilter) {
      parts.push(contractAwardFilter);
    }

    const publicationDateFilter = this.buildDateRangeFilter(
      resolvedFilters.publicationDateFrom,
      resolvedFilters.publicationDateTo,
    );

    if (publicationDateFilter) {
      parts.push({ publicationDate: publicationDateFilter });
    }

    const submissionDeadlineFilter = this.buildDateRangeFilter(
      resolvedFilters.submissionDeadlineFrom,
      resolvedFilters.submissionDeadlineTo,
    );

    if (submissionDeadlineFilter) {
      parts.push({
        $or: [
          { submissionDeadline: submissionDeadlineFilter },
          { submissionDeadline: null },
          { submissionDeadline: { $exists: false } },
        ],
      });
    }

    if (resolvedFilters.tenderIds?.length) {
      parts.push({ id: { $in: resolvedFilters.tenderIds } });
    }

    if (parts.length === 0) {
      return {};
    }

    return parts.length === 1 ? parts[0] : { $and: parts };
  }

  private buildDateRangeFilter(
    from: string | undefined,
    to: string | undefined,
  ): MongoFilter | undefined {
    const filter: MongoFilter = {};

    if (from?.trim()) {
      filter.$gte = this.parseTedDateBoundary(from, 'start');
    }

    if (to?.trim()) {
      filter.$lte = this.parseTedDateBoundary(to, 'end');
    }

    return Object.keys(filter).length > 0 ? filter : undefined;
  }

  private parseTedDateBoundary(value: string, boundary: 'start' | 'end'): Date {
    const trimmed = value.trim();

    if (/^\d{8}$/.test(trimmed)) {
      const date = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
      const time = boundary === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';

      return new Date(`${date}${time}`);
    }

    return new Date(trimmed);
  }

  private buildNumberRangeFilter(
    from: number | undefined,
    to: number | undefined,
  ): MongoFilter | undefined {
    const filter: MongoFilter = {};

    if (from !== undefined) {
      filter.$gte = from;
    }

    if (to !== undefined) {
      filter.$lte = to;
    }

    return Object.keys(filter).length > 0 ? filter : undefined;
  }

  private buildTextRegex(value: string): RegExp {
    return new RegExp(this.escapeRegex(value.trim()), 'i');
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async buildContractAwardFilter(
    filters: TedTenderSearchRequestDto,
  ): Promise<MongoFilter | undefined> {
    if (!filters.currency?.length) {
      const amountFilter = this.buildNumberRangeFilter(
        filters.contractAwardFrom,
        filters.contractAwardTo,
      );

      return amountFilter
        ? this.buildEstimatedValueWithMissingEurFilter({
            'estimatedValue.amount': amountFilter,
          })
        : undefined;
    }

    const eurRanges = await Promise.all(
      filters.currency.map((currency) =>
        this.buildEurRangeForCurrency(
          currency,
          filters.contractAwardFrom,
          filters.contractAwardTo,
        ),
      ),
    );

    const validRanges = eurRanges.filter(
      (range): range is MongoFilter => !!range,
    );

    if (validRanges.length === 0) {
      return undefined;
    }

    return this.buildEstimatedValueWithMissingEurFilter(
      validRanges.length === 1 ? validRanges[0] : { $or: validRanges },
    );
  }

  private buildEstimatedValueWithMissingEurFilter(
    valueFilter: MongoFilter,
  ): MongoFilter {
    return {
      $or: [
        valueFilter,
        { estimatedValueEur: null },
        { estimatedValueEur: { $exists: false } },
      ],
    };
  }

  private async buildEurRangeForCurrency(
    currency: CurrencySign,
    from?: number,
    to?: number,
  ): Promise<MongoFilter | undefined> {
    const [fromEur, toEur] = await Promise.all([
      from === undefined
        ? Promise.resolve(undefined)
        : this.currencyExchangeRatesService.convertToEur(from, currency),
      to === undefined
        ? Promise.resolve(undefined)
        : this.currencyExchangeRatesService.convertToEur(to, currency),
    ]);

    const filter = this.buildNumberRangeFilter(
      fromEur ?? undefined,
      toEur ?? undefined,
    );

    return filter ? { estimatedValueEur: filter } : undefined;
  }
}
