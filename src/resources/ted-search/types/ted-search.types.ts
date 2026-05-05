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
  NOTICE_TITLE = 'notice-title',
  BUYER_NAME = 'buyer-name',
  CREATED_AT = 'created-at',
  UPDATED_AT = 'updated-at',
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
