import { TedNoticeType } from '../../tenders/types';

export interface TedTenderSearchFilters {
  text?: string;
  title?: string;
  description?: string;
  cpvCodes?: string[];
  buyerCountries?: string[];
  placeOfPerformance?: string[];
  noticeTypes?: TedNoticeType[];
  contractNature?: 'services' | 'supplies' | 'works';
  publicationDateFrom?: string;
  publicationDateTo?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
}

export function quoteTedValue(value: string): string {
  return `"${value.trim().replace(/"/g, '\\"')}"`;
}

export function buildTedTenderSearchQuery(
  filters: TedTenderSearchFilters,
): string {
  console.log({ filters });
  const parts = [
    buildTextPart('FT', filters.text),
    buildTextPart('notice-title', filters.title),
    buildTextPart('description-proc', filters.description),
    buildInPart('classification-cpv', filters.cpvCodes),
    buildInPart('buyer-country', filters.buyerCountries),
    buildInPart('place-of-performance', filters.placeOfPerformance),
    buildInPart('notice-type', filters.noticeTypes),
    buildEqualsPart('contract-nature', filters.contractNature),
    buildPublicationDatePart(
      filters.publicationDateFrom,
      filters.publicationDateTo,
    ),
    buildDateRangePart('deadline', filters.deadlineFrom, filters.deadlineTo),
  ].filter((part): part is string => part !== undefined);

  if (parts.length === 0) {
    return 'publication-number = *';
  }
  console.log({ parts });
  return parts.map((part) => `(${part})`).join(' AND ');
}

function buildTextPart(
  field: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return `${field} ~ ${quoteTedValue(value)}`;
}

function buildInPart(
  field: string,
  values: string[] | undefined,
): string | undefined {
  const cleaned = values?.map((value) => value.trim()).filter(Boolean) ?? [];

  if (cleaned.length === 0) {
    return undefined;
  }

  return `${field} IN (${cleaned.join(' ')})`;
}

function buildEqualsPart(
  field: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return `${field}=${value.trim()}`;
}

function buildPublicationDatePart(
  from: string | undefined,
  to: string | undefined,
): string | undefined {
  const fromDate = from?.trim();
  const toDate = to?.trim();

  if (fromDate && toDate) {
    return `publication-date >=${fromDate}<=${toDate}`;
  }

  if (fromDate) {
    return `publication-date >=${fromDate}`;
  }

  if (toDate) {
    return `publication-date <=${toDate}`;
  }

  return undefined;
}

function buildDateRangePart(
  field: string,
  from?: string,
  to?: string,
): string | undefined {
  const parts: string[] = [];

  if (from?.trim()) {
    parts.push(`${field} >= ${from.trim()}`);
  }

  if (to?.trim()) {
    parts.push(`${field} <= ${to.trim()}`);
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(' AND ');
}
