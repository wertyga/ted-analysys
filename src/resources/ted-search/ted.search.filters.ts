import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';

type MongoFilter = Record<string, unknown>;

export class TedSearchFilters {
  buildLocalTenderQuery(filters: TedTenderSearchRequestDto): MongoFilter {
    const parts: MongoFilter[] = [];

    if (filters.text?.trim()) {
      parts.push({
        $or: [
          { title: this.buildTextRegex(filters.text) },
          { titleProc: this.buildTextRegex(filters.text) },
          { titleLot: this.buildTextRegex(filters.text) },
          { description: this.buildTextRegex(filters.text) },
          { descriptionLot: this.buildTextRegex(filters.text) },
          { buyerName: this.buildTextRegex(filters.text) },
          { publicationNumber: this.buildTextRegex(filters.text) },
        ],
      });
    }

    if (filters.cpvCodes?.length) {
      parts.push({ cpvCodes: { $in: filters.cpvCodes } });
    }

    const buyerCountries = [...(filters.buyerCountries ?? [])];

    if (buyerCountries.length) {
      parts.push({ buyerCountry: { $in: buyerCountries } });
    }

    if (filters.buyerName?.trim()) {
      parts.push({ buyerName: this.buildTextRegex(filters.buyerName) });
    }

    if (filters.buyerIdentifier?.trim()) {
      parts.push({
        buyerIdentifier: this.buildTextRegex(filters.buyerIdentifier),
      });
    }

    if (filters.buyerCity?.trim()) {
      parts.push({ buyerCity: this.buildTextRegex(filters.buyerCity) });
    }

    if (filters.buyerMainActivity?.length) {
      parts.push({ buyerMainActivities: { $in: filters.buyerMainActivity } });
    }

    if (filters.placeOfPerformance?.length) {
      parts.push({
        placeOfPerformanceCountries: { $in: filters.placeOfPerformance },
      });
    }

    if (filters.submissionLanguage?.length) {
      parts.push({ submissionLanguages: { $in: filters.submissionLanguage } });
    }

    if (filters.noticeTypes?.length) {
      parts.push({ noticeType: { $in: filters.noticeTypes } });
    }

    if (filters.procedureType?.length) {
      parts.push({ procedureType: { $in: filters.procedureType } });
    }

    if (filters.contractNature?.length) {
      parts.push({ contractNature: { $in: filters.contractNature } });
    }

    if (filters.currency?.length) {
      parts.push({ 'estimatedValue.currency': { $in: filters.currency } });
    }

    const contractAwardFilter = this.buildNumberRangeFilter(
      filters.contractAwardFrom,
      filters.contractAwardTo,
    );

    if (contractAwardFilter) {
      parts.push({ 'estimatedValue.amount': contractAwardFilter });
    }

    const publicationDateFilter = this.buildDateRangeFilter(
      filters.publicationDateFrom,
      filters.publicationDateTo,
    );

    if (publicationDateFilter) {
      parts.push({ publicationDate: publicationDateFilter });
    }

    const submissionDeadlineFilter = this.buildDateRangeFilter(
      filters.submissionDeadlineFrom,
      filters.submissionDeadlineTo,
    );

    if (submissionDeadlineFilter) {
      parts.push({ submissionDeadline: submissionDeadlineFilter });
    }

    if (filters.tenderIds?.length) {
      parts.push({ id: { $in: filters.tenderIds } });
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
}
