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

    if (filters.title?.trim()) {
      parts.push({
        $or: [
          { title: this.buildTextRegex(filters.title) },
          { titleProc: this.buildTextRegex(filters.title) },
          { titleLot: this.buildTextRegex(filters.title) },
        ],
      });
    }

    if (filters.description?.trim()) {
      parts.push({
        $or: [
          { description: this.buildTextRegex(filters.description) },
          { descriptionLot: this.buildTextRegex(filters.description) },
        ],
      });
    }

    if (filters.cpvCodes?.length) {
      parts.push({ cpvCodes: { $in: filters.cpvCodes } });
    }

    if (filters.buyerCountries?.length) {
      parts.push({ buyerCountry: { $in: filters.buyerCountries } });
    }

    if (filters.placeOfPerformance?.length) {
      parts.push({
        placeOfPerformanceCountries: { $in: filters.placeOfPerformance },
      });
    }

    if (filters.noticeTypes?.length) {
      parts.push({ noticeType: { $in: filters.noticeTypes } });
    }

    if (filters.contractNature) {
      parts.push({ contractNature: filters.contractNature });
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

    return parts.length === 1 ? parts[0] : { $and: parts };
  }

  buildOpportunityScoreQuery(
    filters: TedTenderSearchRequestDto,
  ): MongoFilter | undefined {
    const filter = this.buildNumberRangeFilter(
      filters.opportunityScoreFrom,
      filters.opportunityScoreTo,
    );

    return filter ? { opportunityScore: filter } : undefined;
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
