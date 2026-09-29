import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  detectPageIssues,
  inspectMarketingPage,
} from './marketing-page-inspector';
import {
  classifyPage,
  estimateExtraClicks,
  expectedCtrForPosition,
  normalizePagePath,
  normalizeText,
  TARGET_POSITION_CTR,
} from './marketing-task.utils';
import {
  Ga4DimensionRow,
  Ga4LandingPageRow,
  GscQueryChangeRow,
  GscRowWithDelta,
  GscTotalsWithDelta,
  MarketingDataCollection,
  MarketingDataSnapshot,
  MarketingTaskMetrics,
  MarketingTaskMetricsComparison,
  SitePageTemplate,
} from './marketing-task.types';

/** Search Console data is only final after ~2-3 days. */
const GSC_DATA_LAG_DAYS = 3;

/** Minimum impressions for a row to be considered a meaningful signal. */
const MIN_IMPRESSIONS = 100;

/** Landing pages passed to the LLM; more are fetched for task metrics. */
const SNAPSHOT_LANDING_PAGES = 50;

/** Row caps of the GSC exports; pages cover the long tail of tender pages. */
const GSC_MAX_PAGES = 25000;
const GSC_MAX_QUERIES = 5000;
const GSC_MAX_PAIRS = 10000;

/** Live pages fetched per run to show the model current titles/content. */
const MAX_INSPECTED_PAGES = 20;
const INSPECT_CONCURRENCY = 5;

/** Templates whose best page is always inspected as a sample of the template. */
const SAMPLE_TEMPLATES = [
  SitePageTemplate.home,
  SitePageTemplate.tender,
  SitePageTemplate.award_tender,
  SitePageTemplate.buyer,
  SitePageTemplate.contractor,
  SitePageTemplate.industry,
  SitePageTemplate.country,
  SitePageTemplate.country_industry,
];

const DEFAULT_BRAND_TERMS = 'tenderwize,tenderwise,tender wize';

const aggregateGsc = (rows: GscRow[]) => {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;

  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weightedPosition += row.position * row.impressions;
  }

  return {
    clicks,
    impressions,
    ctr: impressions ? round(clicks / impressions, 4) : 0,
    position: impressions ? round(weightedPosition / impressions, 1) : 0,
  };
};

const withPrevTotals = (
  current: GscRow[],
  previous: GscRow[],
): GscTotalsWithDelta => {
  const now = aggregateGsc(current);
  const prev = aggregateGsc(previous);

  return {
    ...now,
    prevClicks: prev.clicks,
    prevImpressions: prev.impressions,
    prevCtr: prev.ctr,
    prevPosition: prev.position,
  };
};

const groupBy = <T>(rows: T[], keyOf: (row: T) => string | undefined) => {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = keyOf(row);

    if (key === undefined) continue;

    const group = groups.get(key);

    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  return groups;
};

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
    private readonly configService: ConfigService,
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
    snapshot.inspectedPages = await this.inspectOpportunityPages(snapshot, raw);

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

    const templateTotals = groupBy(
      raw.gscPages,
      (row) => classifyPage(row.key).template,
    );

    return ({ pageUrl, query, template }) => {
      const page = normalizePagePath(pageUrl);
      const queryKey = normalizeText(query);

      if (!page && !queryKey) {
        const rows = template ? templateTotals.get(template) : undefined;
        return rows ? aggregateGsc(rows) : undefined;
      }

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
    const [
      totals,
      prevTotals,
      pages,
      prevPages,
      queries,
      prevQueries,
      pairs,
      countries,
      prevCountries,
      devices,
      prevDevices,
    ] = await Promise.all([
      gsc.query(period, [], 1),
      gsc.query(previousPeriod, [], 1),
      gsc.queryAll(period, ['page'], GSC_MAX_PAGES),
      gsc.queryAll(previousPeriod, ['page'], GSC_MAX_PAGES),
      gsc.queryAll(period, ['query'], GSC_MAX_QUERIES),
      gsc.queryAll(previousPeriod, ['query'], GSC_MAX_QUERIES),
      gsc.queryAll(period, ['query', 'page'], GSC_MAX_PAIRS),
      gsc.query(period, ['country'], 20),
      gsc.query(previousPeriod, ['country'], 50),
      gsc.query(period, ['device'], 5),
      gsc.query(previousPeriod, ['device'], 5),
    ]);

    raw.gscPages = pages;
    raw.gscQueries = queries;
    raw.gscPairs = pairs;

    const brandTerms = this.getBrandTerms();
    const isBrand = (query: string) => {
      const text = normalizeText(query);
      return brandTerms.some((term) => text.includes(term));
    };
    const nonBrand = <T extends { key: string }>(rows: T[]) =>
      rows.filter((row) => !isBrand(row.key));

    const queryRows = this.withDelta(queries, prevQueries);
    const pageRows = this.withDelta(pages, prevPages);
    const templateOf = (page: string) => classifyPage(page).template;
    const localeOf = (page: string) => classifyPage(page).locale;

    const pairRows = pairs.map((row) => {
      const [query, page] = row.key.split(' | ');
      return { ...row, query, page };
    });
    const pairsByQuery = groupBy(pairRows, (row) => normalizeText(row.query));
    const topPageOf = (query: string) =>
      pairsByQuery
        .get(normalizeText(query))
        ?.reduce((best, row) =>
          row.impressions > best.impressions ? row : best,
        ).page;

    const pagesByTemplate = groupBy(pages, (row) => templateOf(row.key));
    const prevPagesByTemplate = groupBy(prevPages, (row) =>
      templateOf(row.key),
    );
    const pagesByLocale = groupBy(pages, (row) => localeOf(row.key));
    const prevPagesByLocale = groupBy(prevPages, (row) => localeOf(row.key));

    const brandSplit = (rows: GscRow[]) => ({
      brand: aggregateGsc(rows.filter((row) => isBrand(row.key))),
      other: aggregateGsc(rows.filter((row) => !isBrand(row.key))),
    });
    const brandNow = brandSplit(queries);
    const brandPrev = brandSplit(prevQueries);

    const toChangeRow = (row: GscRowWithDelta): GscQueryChangeRow => ({
      query: row.key,
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.impressions ? row.position : null,
      prevClicks: row.prevClicks,
      prevImpressions: row.prevImpressions,
      prevPosition: row.prevPosition,
      page: topPageOf(row.key),
    });

    // Previous-period queries missing from the current export are lost too.
    const currentQueryKeys = new Set(queries.map((row) => row.key));
    const vanishedQueries: GscRowWithDelta[] = prevQueries
      .filter((row) => !currentQueryKeys.has(row.key))
      .map((row) => ({
        key: row.key,
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
        prevClicks: row.clicks,
        prevImpressions: row.impressions,
        prevPosition: round(row.position, 1),
      }));

    return {
      totals: withPrevTotals(totals, prevTotals),
      templates: [...pagesByTemplate.entries()]
        .map(([template, rows]) => ({
          template: template as SitePageTemplate,
          pagesWithImpressions: rows.length,
          ...withPrevTotals(rows, prevPagesByTemplate.get(template) ?? []),
        }))
        .sort((a, b) => b.impressions - a.impressions),
      locales: [...pagesByLocale.entries()]
        .map(([locale, rows]) => ({
          locale,
          ...withPrevTotals(rows, prevPagesByLocale.get(locale) ?? []),
        }))
        .sort((a, b) => b.impressions - a.impressions),
      brand: {
        terms: brandTerms,
        brandClicks: brandNow.brand.clicks,
        brandImpressions: brandNow.brand.impressions,
        nonBrandClicks: brandNow.other.clicks,
        nonBrandImpressions: brandNow.other.impressions,
        prevBrandClicks: brandPrev.brand.clicks,
        prevNonBrandClicks: brandPrev.other.clicks,
      },
      countries: this.withDelta(countries, prevCountries),
      devices: this.withDelta(devices, prevDevices),
      topQueries: nonBrand(queryRows)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 40),
      // Queries ranking just below the top results: the cheapest wins.
      strikingDistanceQueries: nonBrand(queryRows)
        .filter(
          (row) =>
            row.position >= 4 &&
            row.position <= 20 &&
            row.impressions >= MIN_IMPRESSIONS,
        )
        .map((row) => {
          const page = topPageOf(row.key);
          return {
            ...row,
            page,
            template: page ? templateOf(page) : undefined,
            expectedCtr: TARGET_POSITION_CTR,
            estimatedExtraClicks: estimateExtraClicks(
              row,
              TARGET_POSITION_CTR,
            ),
          };
        })
        .sort((a, b) => b.estimatedExtraClicks - a.estimatedExtraClicks)
        .slice(0, 30),
      lowCtrPages: pageRows
        .filter((row) => row.impressions >= MIN_IMPRESSIONS * 2)
        .map((row) => {
          const expectedCtr = expectedCtrForPosition(row.position);
          return {
            ...row,
            template: templateOf(row.key),
            expectedCtr,
            estimatedExtraClicks: estimateExtraClicks(row, expectedCtr),
          };
        })
        .filter((row) => row.ctr < row.expectedCtr * 0.5)
        .sort((a, b) => b.estimatedExtraClicks - a.estimatedExtraClicks)
        .slice(0, 20),
      decliningPages: pageRows
        .filter(
          (row) => row.prevClicks >= 10 && row.clicks < row.prevClicks * 0.7,
        )
        .sort((a, b) => b.prevClicks - b.clicks - (a.prevClicks - a.clicks))
        .slice(0, 20)
        .map((row) => ({ ...row, template: templateOf(row.key) })),
      lostQueries: nonBrand([...queryRows, ...vanishedQueries])
        .filter(
          (row) =>
            row.prevImpressions >= MIN_IMPRESSIONS / 2 &&
            (row.impressions < row.prevImpressions * 0.5 ||
              (row.prevClicks >= 5 && row.clicks < row.prevClicks * 0.6)),
        )
        .sort(
          (a, b) =>
            b.prevClicks - b.clicks - (a.prevClicks - a.clicks) ||
            b.prevImpressions -
              b.impressions -
              (a.prevImpressions - a.impressions),
        )
        .slice(0, 20)
        .map(toChangeRow),
      newQueries: nonBrand(queryRows)
        .filter(
          (row) =>
            row.impressions >= MIN_IMPRESSIONS / 2 &&
            row.prevImpressions < row.impressions * 0.3,
        )
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 20)
        .map(toChangeRow),
      cannibalization: [...pairsByQuery.values()]
        .filter((rows) => !isBrand(rows[0].query))
        .map((rows) => {
          const total = aggregateGsc(rows);
          const competing = rows
            .filter(
              (row) =>
                row.impressions >= 10 &&
                row.impressions >= total.impressions * 0.1,
            )
            .sort((a, b) => b.impressions - a.impressions)
            .slice(0, 4);

          return {
            query: rows[0].query,
            impressions: total.impressions,
            clicks: total.clicks,
            pages: competing.map((row) => ({
              page: row.page,
              impressions: row.impressions,
              clicks: row.clicks,
              position: round(row.position, 1),
            })),
          };
        })
        .filter(
          (row) =>
            row.pages.length >= 2 && row.impressions >= MIN_IMPRESSIONS / 2,
        )
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 15),
      weakRankingQueries: nonBrand(queryRows)
        .filter(
          (row) => row.position > 20 && row.impressions >= MIN_IMPRESSIONS / 2,
        )
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 20)
        .map(toChangeRow),
    };
  }

  /**
   * Fetches the live pages behind the biggest opportunities plus the best
   * page of every main template, so the model sees the actual titles,
   * descriptions and headings it proposes to change.
   */
  private async inspectOpportunityPages(
    snapshot: MarketingDataSnapshot,
    raw: RawMarketingData,
  ): Promise<MarketingDataSnapshot['inspectedPages']> {
    const gsc = snapshot.searchConsole;
    const targets = new Map<string, string | undefined>();
    const add = (page?: string, query?: string) => {
      if (page && !targets.has(page) && targets.size < MAX_INSPECTED_PAGES) {
        targets.set(page, query);
      }
    };

    // A sample of each template first: template fixes are the biggest lever.
    // Search pages come first; GA4 landing pages cover templates Google
    // barely shows (e.g. not indexed yet).
    const sampleCandidates = [
      ...raw.gscPages.map((row) => row.key),
      ...raw.landingPages.map((row) =>
        this.resolvePageUrl(row.page.startsWith('/') ? row.page : undefined),
      ),
    ];

    for (const template of SAMPLE_TEMPLATES) {
      add(
        sampleCandidates.find(
          (page) => page && classifyPage(page).template === template,
        ),
      );
    }

    if (!gsc) return this.inspectPages(targets);

    gsc.lowCtrPages.slice(0, 5).forEach((row) => add(row.key));
    gsc.strikingDistanceQueries
      .slice(0, 5)
      .forEach((row) => add(row.page, row.key));
    gsc.cannibalization
      .slice(0, 2)
      .forEach((row) =>
        row.pages.slice(0, 2).forEach((page) => add(page.page, row.query)),
      );
    gsc.decliningPages.slice(0, 3).forEach((row) => add(row.key));

    return this.inspectPages(targets);
  }

  /** Inspects pages (url -> target query) a few at a time. */
  private async inspectPages(
    targets: Map<string, string | undefined>,
  ): Promise<MarketingDataSnapshot['inspectedPages']> {
    const entries = [...targets.entries()];
    const inspected: NonNullable<MarketingDataSnapshot['inspectedPages']> = [];

    for (let i = 0; i < entries.length; i += INSPECT_CONCURRENCY) {
      const results = await Promise.all(
        entries
          .slice(i, i + INSPECT_CONCURRENCY)
          .map(([page, query]) => inspectMarketingPage(page, query)),
      );

      inspected.push(
        ...results.map((page) => ({
          ...page,
          h2: page.h2.slice(0, 8),
          template: classifyPage(page.url).template,
          issues: detectPageIssues(page),
        })),
      );
    }

    return inspected;
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
      template: classifyPage(row.dimensions[0]).template,
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

  private getBrandTerms(): string[] {
    return (
      this.configService.get<string>('MARKETING_BRAND_TERMS') ||
      DEFAULT_BRAND_TERMS
    )
      .split(',')
      .map((term) => normalizeText(term))
      .filter(Boolean);
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
