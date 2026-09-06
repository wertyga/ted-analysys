import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';

/**
 * A single, source-verified fact backing a Company Story — see
 * X_POSTS_GUIDELINES.md "Company Story" (web enrichment stage). Every fact
 * here was extracted from text on `sourceUrl` by a strict extraction call
 * that could not cite anything not literally on that page, and `sourceUrl`
 * was checked server-side to be one of the pages this service actually
 * fetched — a fact can never carry a source it wasn't really found on.
 */
export interface ExternalFact {
  fact: string;
  sourceUrl: string;
  sourceTitle: string;
  publishedAt: string | null;
  retrievedAt: string;
}

export interface CompanyStoryEnrichmentContext {
  supplierName: string;
  buyerName?: string;
  awardTitle?: string;
}

export interface InterestingTenderEnrichmentContext {
  buyerName: string;
  tenderTitle: string;
  /** e.g. "dynamic purchasing system" / "framework agreement", used to search for official mechanism documentation. */
  mechanismKeyword?: string;
}

interface BraveSearchResult {
  url: string;
  title: string;
}

interface FetchedPage {
  url: string;
  title: string;
  publishedAt: string | null;
  text: string;
}

const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const MAX_QUERIES_PER_CANDIDATE = 3;
const MAX_RESULTS_PER_QUERY = 5;
const MAX_PAGES_TO_FETCH = 3;
const MAX_FACTS_RETURNED = 6;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_PAGE_TEXT_CHARS = 6000;

/**
 * Curated, high-trust business/press outlets. Deliberately small — this is
 * a factual-accuracy control (per the Company Story wording discipline),
 * not a reach optimization. Extend carefully.
 */
const TRUSTED_MEDIA_DOMAINS = [
  'reuters.com',
  'apnews.com',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'forbes.com',
  'businesswire.com',
  'prnewswire.com',
  'globenewswire.com',
  'politico.eu',
  'euractiv.com',
  'marketwatch.com',
  'cnbc.com',
  'theguardian.com',
  'economist.com',
  'techcrunch.com',
];

/**
 * Additional sources allowed only for Historical Story enrichment — reputable
 * encyclopedic/long-form outlets appropriate for well-established historical
 * events, which wouldn't make sense to trust for a live company/tender claim
 * (see Company Story / Interesting Tender's stricter allowlist above).
 */
const HISTORICAL_TRUSTED_DOMAINS = [
  'wikipedia.org',
  'britannica.com',
  'history.com',
  'smithsonianmag.com',
  'nytimes.com',
  'washingtonpost.com',
  'bbc.com',
  'bbc.co.uk',
  'archives.gov',
  'nationalarchives.gov.uk',
  'nasa.gov',
];

/** Legal-entity suffixes stripped out before matching a supplier name against a hostname. */
const COMPANY_NAME_SUFFIXES = new Set([
  'ltd',
  'limited',
  'llc',
  'inc',
  'incorporated',
  'gmbh',
  'sa',
  'spa',
  'plc',
  'oy',
  'ab',
  'bv',
  'nv',
  'kft',
  'sp',
  'zoo',
  'spolka',
  'as',
  'asa',
  'group',
  'holding',
  'holdings',
  'company',
  'co',
  'corp',
  'corporation',
]);

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function significantNameTokens(name: string): string[] {
  return normalizeForMatch(name)
    .split(' ')
    .filter((token) => token.length >= 4 && !COMPANY_NAME_SUFFIXES.has(token));
}

/** Heuristic: does the hostname contain a distinctive token from the supplier's own name? No hardcoded domain list — this has to work for any supplier globally. */
function isLikelyOfficialSite(hostname: string, supplierName: string): boolean {
  const tokens = significantNameTokens(supplierName);

  if (tokens.length === 0) return false;

  const hostNormalized = normalizeForMatch(hostname).replace(/ /g, '');

  return tokens.some((token) => hostNormalized.includes(token));
}

/** EU institutions and government domains, matched by pattern rather than an exhaustive per-country list. */
function isGovernmentOrEuDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === 'europa.eu' || host.endsWith('.europa.eu')) return true;

  return /(^|\.)(gov|gob|gouv)(\.|$)/i.test(host);
}

function matchesDomainList(hostname: string, domains: string[]): boolean {
  const host = hostname.toLowerCase();

  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isAllowedSource(
  url: string,
  officialSiteMatchName: string,
  allowEncyclopedic = false,
): boolean {
  let hostname: string;

  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  return (
    isGovernmentOrEuDomain(hostname) ||
    matchesDomainList(hostname, TRUSTED_MEDIA_DOMAINS) ||
    isLikelyOfficialSite(hostname, officialSiteMatchName) ||
    (allowEncyclopedic && matchesDomainList(hostname, HISTORICAL_TRUSTED_DOMAINS))
  );
}

/**
 * Web enrichment for a Company Story: given a supplier + the specific
 * award/buyer the detected pattern is anchored on, searches a small,
 * source-restricted slice of the open web for real corroborating context
 * (what the contract is actually for, why it matters) — never a general
 * "tell me about this company" search. Every fact returned is traceable to
 * a real, fetched, allow-listed URL (see ExternalFact). Disabled entirely
 * (returns []) when BRAVE_API_KEY isn't configured, so Company Story keeps
 * working on Tenderwize data alone until the key is added.
 */
@Injectable()
export class WebEnrichmentService {
  private readonly logger = new Logger(WebEnrichmentService.name);

  constructor(private readonly llmAnalysisService: LlmAnalysisService) {}

  isEnabled(): boolean {
    return Boolean(process.env.BRAVE_API_KEY?.trim());
  }

  async enrichCompanyStory(
    context: CompanyStoryEnrichmentContext,
  ): Promise<ExternalFact[]> {
    if (!this.isEnabled()) return [];

    const { supplierName, buyerName, awardTitle } = context;
    const queries: string[] = [];

    if (awardTitle && buyerName) queries.push(`"${awardTitle}" "${buyerName}"`);
    if (buyerName) queries.push(`"${supplierName}" "${buyerName}" contract`);
    if (awardTitle) queries.push(`"${supplierName}" "${awardTitle}"`);
    if (queries.length === 0) {
      queries.push(`"${supplierName}" public procurement contract`);
    }

    return this.searchAndExtract(
      queries,
      supplierName,
      supplierName,
      [awardTitle, buyerName].filter((v): v is string => Boolean(v)).join(' — '),
    );
  }

  /**
   * Searches for real context on the specific mechanism a large/unusual
   * open tender runs under (e.g. an official ESTAR page or press release
   * about its dynamic purchasing system) — never a generic "tell me about
   * this buyer" search. Matches sources against the buyer's name (the
   * publicly identifiable party for an open tender; there is no winner
   * yet).
   */
  async enrichInterestingTender(
    context: InterestingTenderEnrichmentContext,
  ): Promise<ExternalFact[]> {
    if (!this.isEnabled()) return [];

    const { buyerName, tenderTitle, mechanismKeyword } = context;
    const queries: string[] = [`"${buyerName}" "${tenderTitle}"`];

    if (mechanismKeyword) {
      queries.push(`"${buyerName}" ${mechanismKeyword}`);
    }

    queries.push(`"${tenderTitle}"`);

    return this.searchAndExtract(queries, buyerName, buyerName, tenderTitle);
  }

  /**
   * Researches one Historical Story topic (see historical-story-topics.ts):
   * unlike every other pillar, there is no Tenderwize DB fact to corroborate
   * — the web result itself IS the grounding, so the source allowlist is
   * widened to include reputable encyclopedic/historical outlets
   * (Wikipedia, Britannica, national archives, major newspapers) that
   * wouldn't be trusted for a live company/tender claim elsewhere in this
   * pipeline. If nothing verifiable turns up, the caller tries the next
   * topic — this pillar never writes from the model's own "memory" of
   * history.
   */
  async enrichHistoricalStory(topic: string): Promise<ExternalFact[]> {
    if (!this.isEnabled()) return [];

    return this.searchAndExtract(
      [topic, `"${topic}" contract history`],
      topic,
      topic,
      topic,
      true,
    );
  }

  /**
   * Shared pipeline: run up to MAX_QUERIES_PER_CANDIDATE Brave searches,
   * keep only allow-listed results, fetch up to MAX_PAGES_TO_FETCH pages,
   * and run the strict fact-extraction LLM call over them.
   */
  private async searchAndExtract(
    queries: string[],
    /** Name matched against a result's hostname for the "official site" allowlist rule. */
    officialSiteMatchName: string,
    /** What the extracted facts must be about, passed to extractExternalFacts. */
    subjectName: string,
    extractionContext: string,
    allowEncyclopedic = false,
  ): Promise<ExternalFact[]> {
    const seenUrls = new Set<string>();
    const allowedResults: BraveSearchResult[] = [];

    for (const query of queries.slice(0, MAX_QUERIES_PER_CANDIDATE)) {
      const results = await this.braveSearch(query);

      for (const result of results) {
        if (seenUrls.has(result.url)) continue;

        seenUrls.add(result.url);

        if (!isAllowedSource(result.url, officialSiteMatchName, allowEncyclopedic)) {
          continue;
        }

        allowedResults.push(result);
      }
    }

    if (allowedResults.length === 0) return [];

    const pages: FetchedPage[] = [];

    for (const result of allowedResults.slice(0, MAX_PAGES_TO_FETCH)) {
      const page = await this.fetchPage(result.url);

      if (page) pages.push(page);
    }

    if (pages.length === 0) return [];

    const extracted = await this.llmAnalysisService.extractExternalFacts({
      subjectName,
      context: extractionContext,
      pages,
    });

    const retrievedAt = new Date().toISOString();

    return extracted.slice(0, MAX_FACTS_RETURNED).map((fact) => ({
      ...fact,
      retrievedAt,
    }));
  }

  private async braveSearch(query: string): Promise<BraveSearchResult[]> {
    try {
      const response = await axios.get<{
        web?: { results?: { url?: unknown; title?: unknown }[] };
      }>(BRAVE_SEARCH_ENDPOINT, {
        params: { q: query, count: MAX_RESULTS_PER_QUERY },
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': process.env.BRAVE_API_KEY,
        },
        timeout: REQUEST_TIMEOUT_MS,
      });
      const results = response.data?.web?.results;

      if (!Array.isArray(results)) return [];

      return results
        .map((result) => ({
          url: typeof result.url === 'string' ? result.url : '',
          title: typeof result.title === 'string' ? result.title : '',
        }))
        .filter((result) => Boolean(result.url));
    } catch (error) {
      this.logger.warn(
        `Brave Search failed for query "${query}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return [];
    }
  }

  private async fetchPage(url: string): Promise<FetchedPage | null> {
    try {
      const response = await axios.get<string>(url, {
        timeout: REQUEST_TIMEOUT_MS,
        responseType: 'text',
        maxContentLength: 3_000_000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; TenderwizeBot/1.0; +https://tenderwize.com)',
          Accept: 'text/html',
        },
      });

      if (typeof response.data !== 'string') return null;

      const $ = cheerio.load(response.data);

      $('script, style, nav, footer, header, noscript, iframe').remove();

      const title =
        $('title').first().text().trim() ||
        $('meta[property="og:title"]').attr('content')?.trim() ||
        url;
      const publishedAt =
        $('meta[property="article:published_time"]').attr('content') ||
        $('meta[name="date"]').attr('content') ||
        $('time[datetime]').first().attr('datetime') ||
        null;
      const mainText = ($('article').text() || $('main').text() || $('body').text() || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_PAGE_TEXT_CHARS);

      if (!mainText) return null;

      return {
        url,
        title,
        publishedAt: publishedAt ? publishedAt.trim() : null,
        text: mainText,
      };
    } catch (error) {
      this.logger.debug(
        `Failed to fetch ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }
  }
}
