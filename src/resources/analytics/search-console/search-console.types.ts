export type SearchConsoleDimension = 'query' | 'page' | 'device' | 'country';

export interface SearchConsoleFilter {
  dimension: SearchConsoleDimension;
  operator: 'equals' | 'contains';
  expression: string;
}

export interface GscRow {
  /** Dimension values joined with " | " in the requested order. */
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}
