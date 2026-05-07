import { TedNoticeType } from '../../tenders/types';
import { TedSortOrder, TedTenderSortColumn } from '../types/ted-search.types';
import { buildAdaptiveCpvQuery } from './ted-cpv.builder';
import {
  normalizeTedCountryCodes,
  TedEligibleCountryCode,
} from '../utils/ted-countries';

export interface TedTenderSearchFilters {
  text?: string;
  title?: string;
  description?: string;
  cpvCodes?: string[];
  buyerCountries?: TedEligibleCountryCode[];
  placeOfPerformance?: TedEligibleCountryCode[];
  noticeTypes?: TedNoticeType[];
  contractNature?: 'services' | 'supplies' | 'works';
  publicationDateFrom?: string;
  publicationDateTo?: string;
  submissionDeadlineFrom?: string;
  submissionDeadlineTo?: string;
  sortColumn?: TedTenderSortColumn;
  sortOrder?: TedSortOrder;
}

export function quoteTedValue(value: string): string {
  return `"${value.trim().replace(/"/g, '\\"')}"`;
}

export function buildTedTenderSearchQuery(
  filters: TedTenderSearchFilters,
): string {
  const parts = [
    buildTextPart('FT', filters.text),
    buildTextPart('notice-title', filters.title),
    buildTextPart('description-proc', filters.description),
    buildAdaptiveCpvQuery(filters.cpvCodes),
    buildCountryInPart('buyer-country', filters.buyerCountries),
    buildCountryInPart('place-of-performance', filters.placeOfPerformance),
    buildInPart('notice-type', filters.noticeTypes),
    buildEqualsPart('contract-nature', filters.contractNature),
    buildPublicationDatePart(
      filters.publicationDateFrom,
      filters.publicationDateTo,
    ),
    buildDateRangePart(
      'deadline-receipt-request',
      filters.submissionDeadlineFrom,
      filters.submissionDeadlineTo,
    ),
  ].filter((part): part is string => part !== undefined);

  const query =
    parts.length === 0
      ? 'publication-number = *'
      : parts.map((part) => `(${part})`).join(' AND ');

  return appendSortPart(query, filters.sortColumn, filters.sortOrder);
}

function appendSortPart(
  query: string,
  sortColumn: TedTenderSortColumn | undefined,
  sortOrder: TedSortOrder | undefined,
): string {
  if (sortColumn === undefined) {
    return query;
  }

  const direction = sortOrder === TedSortOrder.DESC ? ' DESC' : '';

  return `${query} SORT BY ${sortColumn}${direction}`;
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

function buildCountryInPart(
  field: string,
  values: string[] | undefined,
): string | undefined {
  const cleaned = normalizeTedCountryCodes(values);

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
    return `publication-date >= ${fromDate} AND publication-date <= ${toDate}`;
  }

  if (fromDate) {
    return `publication-date >= ${fromDate}`;
  }

  if (toDate) {
    return `publication-date <= ${toDate}`;
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
