import { DateRange } from '@/resources/analytics/google.types';
import { GscRow } from '@/resources/analytics/search-console/search-console.types';

export enum Priority {
  low = 'low',
  medium = 'medium',
  high = 'high',
}

export enum MarketingTaskStatus {
  new = 'new',
  in_progress = 'in_progress',
  done = 'done',
  rejected = 'rejected',
}

export enum MarketingTaskCategory {
  /** Title/meta description rewrites for pages with low CTR at a good position. */
  ctr = 'ctr',
  /** Improve/extend existing content for queries ranking in positions ~4-20. */
  content = 'content',
  /** New pages/sections for queries the site has impressions for but no good page. */
  content_gap = 'content_gap',
  /** Indexing, internal linking, speed, mobile, structured data. */
  technical = 'technical',
  /** Landing page UX / engagement / conversion issues from GA4. */
  conversion = 'conversion',
  /** Pages or channels losing traffic vs the previous period. */
  traffic_drop = 'traffic_drop',
  /** Broken or missing analytics/key events. */
  tracking = 'tracking',
}

export enum MarketingTaskSource {
  ai = 'ai',
  manual = 'manual',
}

export enum MarketingTaskHistoryActor {
  ai = 'ai',
  admin = 'admin',
  system = 'system',
}

export enum MarketingTaskHistoryType {
  created = 'created',
  status_changed = 'status_changed',
  comment = 'comment',
  /** AI assessment of the task's progress during an analysis run. */
  ai_review = 'ai_review',
  /** Metrics recorded during an analysis run without an AI note. */
  metrics = 'metrics',
  /** On-demand check of a single task (live page + targeted metrics). */
  check = 'check',
}

/** Whether the work described by the task is visible on the live site. */
export enum MarketingTaskCheckVerdict {
  implemented = 'implemented',
  partially = 'partially',
  not_implemented = 'not_implemented',
  unclear = 'unclear',
}

/** Whether the metrics moved since the work was done. */
export enum MarketingTaskCheckEffect {
  positive = 'positive',
  negative = 'negative',
  none = 'none',
  too_early = 'too_early',
  unknown = 'unknown',
}

/**
 * Page/query metrics for one period, recorded in the task history so the
 * effect of the work can be compared over time. Fields are absent when the
 * page/query did not show up in the collected data.
 */
export interface MarketingTaskMetrics {
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  sessions?: number;
  engagementRate?: number;
  keyEvents?: number;
}

export interface MarketingTaskHistoryEntry {
  at: Date;
  actor: MarketingTaskHistoryActor;
  type: MarketingTaskHistoryType;
  text?: string;
  /** New status, for status_changed entries. */
  status?: MarketingTaskStatus;
  metrics?: MarketingTaskMetrics;
  periodStart?: string;
  periodEnd?: string;
  /** Result of a check entry. */
  verdict?: MarketingTaskCheckVerdict;
  effect?: MarketingTaskCheckEffect;
}

export interface GscRowWithDelta extends GscRow {
  prevClicks: number;
  prevImpressions: number;
  prevPosition: number | null;
}

export interface Ga4LandingPageRow {
  page: string;
  sessions: number;
  engagementRate: number;
  averageSessionDuration: number;
  keyEvents: number;
  prevSessions: number;
}

export interface Ga4DimensionRow {
  key: string;
  sessions: number;
  engagementRate: number;
  keyEvents: number;
  prevSessions: number;
}

/**
 * A compact, pre-aggregated view of GSC + GA4 data for one period. All
 * derived signals (deltas, low-CTR, striking distance) are computed in code
 * so the LLM only has to reason about them, never do arithmetic.
 */
export interface MarketingDataSnapshot {
  period: DateRange;
  previousPeriod: DateRange;
  searchConsole?: {
    totals: {
      clicks: number;
      impressions: number;
      prevClicks: number;
      prevImpressions: number;
    };
    topQueries: GscRowWithDelta[];
    strikingDistanceQueries: GscRowWithDelta[];
    lowCtrPages: (GscRowWithDelta & { expectedCtr: number })[];
    decliningPages: GscRowWithDelta[];
    queryPagePairs: {
      query: string;
      page: string;
      clicks: number;
      impressions: number;
      position: number;
    }[];
  };
  analytics?: {
    landingPages: Ga4LandingPageRow[];
    channels: Ga4DimensionRow[];
    devices: Ga4DimensionRow[];
  };
  errors: string[];
}

/** Finds the current-period metrics of a task's page and/or query. */
export type MarketingTaskMetricsLookup = (task: {
  pageUrl?: string | null;
  query?: string | null;
}) => MarketingTaskMetrics | undefined;

export interface MarketingDataCollection {
  snapshot: MarketingDataSnapshot;
  metricsFor: MarketingTaskMetricsLookup;
}

/** Metrics of one task page/query, fetched with filters (not from top lists). */
export interface MarketingTaskMetricsComparison {
  period: DateRange;
  previousPeriod: DateRange;
  current?: MarketingTaskMetrics;
  previous?: MarketingTaskMetrics;
  /** Whole-page metrics when the task targets a page + query pair. */
  pageCurrent?: MarketingTaskMetrics;
  pagePrevious?: MarketingTaskMetrics;
  errors: string[];
}

/** SEO-relevant facts extracted from the live HTML of a task page. */
export interface MarketingPageInspection {
  url: string;
  httpStatus?: number;
  error?: string;
  title?: string;
  metaDescription?: string;
  h1: string[];
  h2: string[];
  canonical?: string;
  robots?: string;
  structuredDataTypes: string[];
  wordCount: number;
  /** Occurrences of the task query (case-insensitive) in the page parts. */
  queryMentions?: {
    title: number;
    metaDescription: number;
    h1: number;
    body: number;
  };
}
