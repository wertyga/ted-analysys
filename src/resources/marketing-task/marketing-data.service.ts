import { Injectable, Logger } from '@nestjs/common';
import { formatDate, getSafeErrorMessage, round, shiftDays } from '@/utils';
import { DateRange } from '@/resources/analytics/google.types';
import { GoogleAnalyticsService } from '@/resources/analytics/google-analytics/google-analytics.service';
import { Ga4ReportRow } from '@/resources/analytics/google-analytics/google-analytics.types';
import { SearchConsoleService } from '@/resources/analytics/search-console/search-console.service';
import {
  GscRow,
  SearchConsoleFilter,
} from '@/resources/analytics/search-console/search-console.types';
import {
  expectedCtrForPosition,
  normalizePagePath,
  normalizeText,
} from './marketing-task.utils';
import {
  Ga4DimensionRow,
  Ga4LandingPageRow,
  GscRowWithDelta,
  MarketingDataCollection,
  MarketingDataSnapshot,
  MarketingTaskMetrics,
  MarketingTaskMetricsComparison,
} from './marketing-task.types';

/** Search Console data is only final after ~2-3 days. */
const GSC_DATA_LAG_DAYS = 3;

/** Minimum impressions for a row to be considered a meaningful signal. */
const MIN_IMPRESSIONS = 100;

/** Landing pages passed to the LLM; more are fetched for task metrics. */
const SNAPSHOT_LANDING_PAGES = 50;

interface RawMarketingData {
  gscPages: GscRow[];
  gscQueries: GscRow[];
  gscPairs: GscRow[];
  landingPages: Ga4LandingPageRow[];
}

@Injectable()
export class MarketingDataService {
  private readonly logger = new Logger(MarketingDataService.name);

  constructor(
    private readonly searchConsoleService: SearchConsoleService,
    private readonly googleAnalyticsService: GoogleAnalyticsService,
  ) {}

  getPeriods(days: number): { period: DateRange; previousPeriod: DateRange } {
    const end = shiftDays(new Date(), -GSC_DATA_LAG_DAYS);
    const start = shiftDays(end, -(days - 1));
    const prevEnd = shiftDays(start, -1);
    const prevStart = shiftDays(prevEnd, -(days - 1));

    return {
      period: { startDate: formatDate(start), endDate: formatDate(end) },
      previousPeriod: {
        startDate: formatDate(prevStart),
        endDate: formatDate(prevEnd),
      },
    };
  }

  async collectSnapshot(days = 28): Promise<MarketingDataCollection> {
    const { period, previousPeriod } = this.getPeriods(days);
    const snapshot: MarketingDataSnapshot = {
      period,
      previousPeriod,
      errors: [],
    };
    const raw: RawMarketingData = {
      gscPages: [],
      gscQueries: [],
      gscPairs: [],
      landingPages: [],
    };

    const [searchConsole, analytics] = await Promise.all([
      this.searchConsoleService.isConfigured()
        ? this.collectSearchConsole(period, previousPeriod, raw).catch(
            (error) => {
              snapshot.errors.push(
                `Search Console: ${getSafeErrorMessage(error)}`,
              );
              return undefined;
            },
          )
        : undefined,
      this.googleAnalyticsService.isConfigured()
        ? this.collectAnalytics(period, previousPeriod, raw).catch((error) => {
            snapshot.errors.push(`GA4: ${getSafeErrorMessage(error)}`);
            return undefined;
          })
        : undefined,
    ]);

    snapshot.searchConsole = searchConsole;
    snapshot.analytics = analytics;

    if (snapshot.errors.length) {
      this.logger.warn(
        `Marketing snapshot collected with errors: ${snapshot.errors.join('; ')}`,
      );
    }

    return { snapshot, metricsFor: this.buildMetricsLookup(raw) };
  }

  /** Absolute URL of a task page; GA4-style paths get the GSC site origin. */
  resolvePageUrl(pageUrl?: string | null): string | undefined {
    if (!pageUrl) return undefined;
    if (/^https?:\/\//i.test(pageUrl)) return pageUrl;

    const origin = this.searchConsoleService.getSiteOrigin();

    return origin ? `${origin}/${pageUrl.replace(/^\/+/, '')}` : undefined;
  }

  /**
   * Fetches the metrics of exactly one task page/query (filtered GSC and GA4
   * requests) for the last `days` and the same number of days before, so
   * low-traffic pages that never reach the top lists are covered too.
   */
  async collectTaskMetrics(
    task: { pageUrl?: string | null; query?: string | null },
    days = 14,
  ): Promise<MarketingTaskMetricsComparison> {
    const { period, previousPeriod } = this.getPeriods(days);
    const result: MarketingTaskMetricsComparison = {
      period,
      previousPeriod,
      errors: [],
    };
    const pageUrl = this.resolvePageUrl(task.pageUrl);
    const pagePath = normalizePagePath(task.pageUrl);
    const query = task.query?.trim();

    if (!pagePath && !query) return result;

    const gscFilters = (withQuery: boolean): SearchConsoleFilter[] => [
      ...(pageUrl
        ? [
            {
              dimension: 'page' as const,
              operator: 'equals' as const,
              expression: pageUrl,
            },
          ]
        : []),
      ...(withQuery && query
        ? [
            {
              dimension: 'query' as const,
              operator: 'equals' as const,
              expression: query,
            },
          ]
        : []),
    ];
    const gscTotals = async (range: DateRange, withQuery: boolean) => {
      const filters = gscFilters(withQuery);
      if (!filters.length) return undefined;

      const [row] = await this.searchConsoleService.query(
        range,
        [],
        1,
        filters,
      );
      return row && row.impressions
        ? {
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: round(row.ctr, 4),
            position: round(row.position, 1),
          }
        : undefined;
    };
    const gaTotals = async (range: DateRange) => {
      const [row] = await this.googleAnalyticsService.runReport(
        range,
        [],
        ['sessions', 'engagementRate', 'keyEvents'],
        1,
        {
          filter: {
            fieldName: 'landingPage',
            inListFilter: {
              values: [pagePath, `${pagePath}/`],
              caseSensitive: false,
            },
          },
        },
      );
      return row && row.metrics.sessions
        ? {
            sessions: row.metrics.sessions,
            engagementRate: round(row.metrics.engagementRate),
            keyEvents: row.metrics.keyEvents,
          }
        : undefined;
    };
    const safe = async <T>(label: string, run: () => Promise<T>) => {
      try {
        return await run();
      } catch (error) {
        result.errors.push(`${label}: ${getSafeErrorMessage(error)}`);
        return undefined;
      }
    };

    const useGsc = this.searchConsoleService.isConfigured();
    const useGa = this.googleAnalyticsService.isConfigured() && !!pagePath;
    const hasPair = !!pageUrl && !!query;

    const [gsc, gscPrev, gscPage, gscPagePrev, ga, gaPrev] = await Promise.all([
      useGsc
        ? safe('Search Console', () => gscTotals(period, true))
        : undefined,
      useGsc
        ? safe('Search Console', () => gscTotals(previousPeriod, true))
        : undefined,
      useGsc && hasPair
        ? safe('Search Console', () => gscTotals(period, false))
        : undefined,
      useGsc && hasPair
        ? safe('Search Console', () => gscTotals(previousPeriod, false))
        : undefined,
      useGa ? safe('GA4', () => gaTotals(period)) : undefined,
      useGa ? safe('GA4', () => gaTotals(previousPeriod)) : undefined,
    ]);

    const merge = (...parts: (MarketingTaskMetrics | undefined)[]) => {
      const metrics = Object.assign({}, ...parts) as MarketingTaskMetrics;
      return Object.keys(metrics).length ? metrics : undefined;
    };

    result.current = merge(gsc, ga);
    result.previous = merge(gscPrev, gaPrev);
    if (hasPair) {
      result.pageCurrent = merge(gscPage, ga);
      result.pagePrevious = merge(gscPagePrev, gaPrev);
    }
    result.errors = [...new Set(result.errors)];

    return result;
  }

  private buildMetricsLookup(
    raw: RawMarketingData,
  ): MarketingDataCollection['metricsFor'] {
    const toGscMetrics = (row?: GscRow): MarketingTaskMetrics =>
      row
        ? {
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: round(row.ctr, 4),
            position: round(row.position, 1),
          }
        : {};
    const pages = new Map(
      raw.gscPages.map((row) => [normalizePagePath(row.key), row]),
    );
    const queries = new Map(
      raw.gscQueries.map((row) => [normalizeText(row.key), row]),
    );
    const pairs = new Map(
      raw.gscPairs.map((row) => {
        const [query, page] = row.key.split(' | ');
        return [`${normalizeText(query)}|${normalizePagePath(page)}`, row];
      }),
    );
    const landingPages = new Map(
      raw.landingPages.map((row) => [normalizePagePath(row.page), row]),
    );

    return ({ pageUrl, query }) => {
      const page = normalizePagePath(pageUrl);
      const queryKey = normalizeText(query);

      if (!page && !queryKey) return undefined;

      const gscRow =
        page && queryKey
          ? pairs.get(`${queryKey}|${page}`)
          : page
            ? pages.get(page)
            : queries.get(queryKey);
      const landingPage = page ? landingPages.get(page) : undefined;
      const metrics: MarketingTaskMetrics = {
        ...toGscMetrics(gscRow),
        ...(landingPage && {
          sessions: landingPage.sessions,
          engagementRate: landingPage.engagementRate,
          keyEvents: landingPage.keyEvents,
        }),
      };

      return Object.keys(metrics).length ? metrics : undefined;
    };
  }

  private async collectSearchConsole(
    period: DateRange,
    previousPeriod: DateRange,
    raw: RawMarketingData,
  ): Promise<MarketingDataSnapshot['searchConsole']> {
    const gsc = this.searchConsoleService;
    const [queries, prevQueries, pages, prevPages, pairs] = await Promise.all([
      gsc.query(period, ['query'], 1000),
      gsc.query(previousPeriod, ['query'], 1000),
      gsc.query(period, ['page'], 500),
      gsc.query(previousPeriod, ['page'], 500),
      gsc.query(period, ['query', 'page'], 1000),
    ]);

    raw.gscPages = pages;
    raw.gscQueries = queries;
    raw.gscPairs = pairs;

    const queryRows = this.withDelta(queries, prevQueries);
    const pageRows = this.withDelta(pages, prevPages);
    const sum = (rows: GscRow[], field: 'clicks' | 'impressions') =>
      rows.reduce((total, row) => total + row[field], 0);

    return {
      totals: {
        clicks: sum(pages, 'clicks'),
        impressions: sum(pages, 'impressions'),
        prevClicks: sum(prevPages, 'clicks'),
        prevImpressions: sum(prevPages, 'impressions'),
      },
      topQueries: [...queryRows]
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 40),
      // Queries ranking just below the top results: the cheapest wins.
      strikingDistanceQueries: queryRows
        .filter(
          (row) =>
            row.position >= 4 &&
            row.position <= 20 &&
            row.impressions >= MIN_IMPRESSIONS,
        )
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 30),
      lowCtrPages: pageRows
        .filter((row) => row.impressions >= MIN_IMPRESSIONS * 2)
        .map((row) => ({
          ...row,
          expectedCtr: expectedCtrForPosition(row.position),
        }))
        .filter((row) => row.ctr < row.expectedCtr * 0.5)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 20),
      decliningPages: pageRows
        .filter(
          (row) => row.prevClicks >= 10 && row.clicks < row.prevClicks * 0.7,
        )
        .sort((a, b) => b.prevClicks - b.clicks - (a.prevClicks - a.clicks))
        .slice(0, 20),
      queryPagePairs: pairs
        .filter((row) => row.impressions >= MIN_IMPRESSIONS / 2)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 60)
        .map((row) => {
          const [query, page] = row.key.split(' | ');
          return {
            query,
            page,
            clicks: row.clicks,
            impressions: row.impressions,
            position: round(row.position, 1),
          };
        }),
    };
  }

  private async collectAnalytics(
    period: DateRange,
    previousPeriod: DateRange,
    raw: RawMarketingData,
  ): Promise<MarketingDataSnapshot['analytics']> {
    const ga = this.googleAnalyticsService;
    const metrics = [
      'sessions',
      'engagementRate',
      'averageSessionDuration',
      'keyEvents',
    ];
    const [pages, prevPages, channels, prevChannels, devices, prevDevices] =
      await Promise.all([
        ga.runReport(period, ['landingPage'], metrics, 200),
        ga.runReport(previousPeriod, ['landingPage'], ['sessions'], 200),
        ga.runReport(period, ['sessionDefaultChannelGroup'], metrics, 20),
        ga.runReport(
          previousPeriod,
          ['sessionDefaultChannelGroup'],
          ['sessions'],
          20,
        ),
        ga.runReport(period, ['deviceCategory'], metrics, 10),
        ga.runReport(previousPeriod, ['deviceCategory'], ['sessions'], 10),
      ]);

    const prevSessionsByKey = (rows: Ga4ReportRow[]) =>
      new Map(rows.map((row) => [row.dimensions[0], row.metrics.sessions]));

    const prevPageSessions = prevSessionsByKey(prevPages);
    const landingPages: Ga4LandingPageRow[] = pages.map((row) => ({
      page: row.dimensions[0],
      sessions: row.metrics.sessions,
      engagementRate: round(row.metrics.engagementRate),
      averageSessionDuration: Math.round(row.metrics.averageSessionDuration),
      keyEvents: row.metrics.keyEvents,
      prevSessions: prevPageSessions.get(row.dimensions[0]) ?? 0,
    }));

    const toDimensionRows = (
      rows: Ga4ReportRow[],
      prevRows: Ga4ReportRow[],
    ): Ga4DimensionRow[] => {
      const prev = prevSessionsByKey(prevRows);
      return rows.map((row) => ({
        key: row.dimensions[0],
        sessions: row.metrics.sessions,
        engagementRate: round(row.metrics.engagementRate),
        keyEvents: row.metrics.keyEvents,
        prevSessions: prev.get(row.dimensions[0]) ?? 0,
      }));
    };

    raw.landingPages = landingPages;

    return {
      landingPages: landingPages.slice(0, SNAPSHOT_LANDING_PAGES),
      channels: toDimensionRows(channels, prevChannels),
      devices: toDimensionRows(devices, prevDevices),
    };
  }

  private withDelta(current: GscRow[], previous: GscRow[]): GscRowWithDelta[] {
    const prevByKey = new Map(previous.map((row) => [row.key, row]));

    return current.map((row) => {
      const prev = prevByKey.get(row.key);
      return {
        key: row.key,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: round(row.ctr, 4),
        position: round(row.position, 1),
        prevClicks: prev?.clicks ?? 0,
        prevImpressions: prev?.impressions ?? 0,
        prevPosition: prev ? round(prev.position, 1) : null,
      };
    });
  }
}
