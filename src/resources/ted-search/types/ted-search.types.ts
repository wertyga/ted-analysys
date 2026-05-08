export enum TedScope {
  ACTIVE = 'ACTIVE',
  ALL = 'ALL',
  LATEST = 'LATEST',
}

export enum TedPaginationMode {
  PAGE_NUMBER = 'PAGE_NUMBER',
  ITERATION = 'ITERATION',
}

export enum TedSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum TedTenderSortColumn {
  PUBLICATION_DATE = 'publication-date',
  DEADLINE = 'deadline',
  BUYER_COUNTRY = 'buyer-country',
  BUDGET = 'total-value',
}

export interface TedNotice {
  [key: string]: any;
}

export interface TedSearchResponse {
  notices?: TedNotice[];
  totalCount?: number;
  totalNoticeCount?: number;
  iterationNextToken?: string;
  nextPageToken?: string;
  [key: string]: unknown;
}
