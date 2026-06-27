import { TedNoticeType } from '../../tenders/types';
import { TedSortOrder, TedTenderSortColumn } from '../types/ted-search.types';
import { buildAdaptiveCpvQuery } from './ted-cpv.builder';
import {
  CurrencySign,
  normalizeTedCountryCodes,
  type TedEligibleCountryCode,
} from '@/resources/codelist';
import {
  TedContractNature,
  TedDeadlineRange,
  TedProcedureType,
} from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { getTedDate, resolveDeadlineRange } from '@/resources/ted-search/utils';

export interface TedTenderSearchFilters {
  text?: string;
  cpvCodes?: string[];
  publicationNumber?: string[];
  placeOfPerformance?: TedEligibleCountryCode[];
  submissionLanguage?: string[];
  noticeTypes?: TedNoticeType[];
  procedureType?: TedProcedureType[];
  contractNature?: TedContractNature[];
  currency?: CurrencySign[];
  publicationDateFrom?: string;
  publicationDateTo?: string;
  submissionDeadlineRange?: TedDeadlineRange;
  submissionDeadlineFrom?: string;
  submissionDeadlineTo?: string;
  sortColumn?: TedTenderSortColumn;
  sortOrder?: TedSortOrder;
  contractAwardFrom?: number;
  contractAwardTo?: number;
  winnerSelectionStatus?: string;
}

export function buildTedTenderSearchQuery(
  filters: TedTenderSearchFilters,
): string {
  const {
    text,
    cpvCodes,
    placeOfPerformance,
    submissionLanguage,
    noticeTypes,
    procedureType,
    contractNature,
    currency,
    publicationDateFrom,
    publicationDateTo,
    submissionDeadlineFrom,
    submissionDeadlineTo,
    contractAwardFrom,
    contractAwardTo,
    publicationNumber,
  } = resolveDeadlineRange(filters);

  const parts = [
    buildTextPart('FT', text),
    buildAdaptiveCpvQuery(cpvCodes),
    buildCountryInPart('place-of-performance', placeOfPerformance),
    buildInPart('submission-language', submissionLanguage),
    buildInPart('notice-type', noticeTypes),
    buildInPart('procedure-type', procedureType),
    buildInPart('contract-nature', contractNature),
    buildInPart('total-value-cur', currency),
    buildInPart('publication-number', publicationNumber),
    buildInPart('winner-selection-status', [
      ...(filters.winnerSelectionStatus ? [filters.winnerSelectionStatus] : []),
    ]),
    buildRangePart('total-value', contractAwardFrom, contractAwardTo),
    buildDateRangePart(
      'publication-date',
      publicationDateFrom,
      publicationDateTo,
    ),
    buildDateRangePart(
      'deadline-receipt-request',
      submissionDeadlineFrom,
      submissionDeadlineTo,
    ),
  ].filter((part): part is string => !!part);

  const query = parts.map((part) => `(${part})`).join(' AND ');

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

  return `${field} ~ (${value})`;
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

function buildRangePart(
  field: string,
  left: number | undefined,
  right: number | undefined,
) {
  if (left && right) {
    return `${field} = (${left} <> ${right})`;
  }

  if (left) {
    return `${field} = (${left} <> 9999999999999)`;
  }

  if (right) {
    return `${field} = (0 <> ${right})`;
  }

  return undefined;
}

function buildPublicationDatePart(
  from: string | undefined,
  to: string | undefined,
): string | undefined {
  return buildDateRangePart('publication-date', from, to);
}

function buildDateRangePart(
  field: string,
  from?: string,
  to?: string,
): string | undefined {
  const fromDate = from?.trim();
  const toDate = to?.trim();

  if (fromDate && toDate) {
    return `${field} >=${fromDate}<=${toDate}`;
  }

  if (fromDate) {
    return `${field} >=${fromDate}`;
  }

  if (toDate) {
    return `${field} <=${toDate}`;
  }

  return undefined;
}
