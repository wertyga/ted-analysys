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

export interface TedNotice {
  [key: string]: unknown;
}

export interface TedSearchResponse {
  notices?: TedNotice[];
  totalCount?: number;
  iterationNextToken?: string;
  [key: string]: unknown;
}
