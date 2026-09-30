import axios from 'axios';
import * as cheerio from 'cheerio';
import { getSafeErrorMessage } from '@/utils';
import {
  MarketingPageInspection,
  SitePageTemplate,
} from './marketing-task.types';
import {
  classifyPage,
  isIndexableLocaleVersion,
  normalizePagePath,
  toDefaultLocalePath,
} from './marketing-task.utils';

const REQUEST_TIMEOUT_MS = 10000;
const MAX_HEADINGS = 15;

/** Server HTML with fewer words is an empty shell (failed SSR / client render). */
const EMPTY_PAGE_WORDS = 50;
const THIN_PAGE_WORDS = 250;
const MAX_TITLE_LENGTH = 60;
const MAX_META_LENGTH = 160;

/**
 * SEO problems visible in the server HTML, computed in code so the model
 * does not have to spot them in raw facts. Each issue is a short code with
 * the value that triggered it.
 */
export const detectPageIssues = (page: MarketingPageInspection): string[] => {
  if (page.error) return [`fetch_error: ${page.error}`];

  const issues: string[] = [];
  const { template, locale } = classifyPage(page.url);

  if (template === SitePageTemplate.app) {
    return ['not_a_seo_page: logged-in app page, disallowed in robots.txt'];
  }

  if (page.httpStatus && page.httpStatus !== 200) {
    issues.push(`http_status: ${page.httpStatus}`);
  }

  // A locale version kept out of the index on purpose (e.g. /de/tenders/*):
  // noindex, canonical to /en and no hreflang are expected there. Only check
  // that this setup holds; its snippet and content do not matter for search.
  if (!isIndexableLocaleVersion(page.url)) {
    const enPath = toDefaultLocalePath(page.url);

    if (!/noindex/i.test(page.robots ?? '')) {
      issues.push(
        `fallback_locale_indexable: ${locale} version is not meant to be indexed but robots is "${page.robots ?? 'none'}"`,
      );
    }
    if (page.canonical && normalizePagePath(page.canonical) !== enPath) {
      issues.push(
        `fallback_locale_canonical: canonical ${page.canonical}, expected ${enPath}`,
      );
    }
    if (page.hreflangs?.length) {
      issues.push('fallback_locale_has_hreflang');
    }

    return issues;
  }

  const title = page.title ?? '';
  // Title without ids and the brand suffix: what describes the entity.
  const titleWords = title
    .replace(/\|.*$/, '')
    .replace(/[\d-]{5,}/g, '')
    .split(/\s+/)
    .filter((word) => /\p{L}{2,}/u.test(word));

  if (/noindex/i.test(page.robots ?? '')) {
    issues.push(`noindex: ${page.robots}`);
  }
  if (
    page.canonical &&
    normalizePagePath(page.canonical) !== normalizePagePath(page.url)
  ) {
    issues.push(`canonical_to_other_url: ${page.canonical}`);
  }
  if (!title) issues.push('missing_title');
  else if (titleWords.length < 3) issues.push(`generic_title: ${title}`);
  if (title.length > MAX_TITLE_LENGTH) {
    issues.push(`title_too_long: ${title.length} chars`);
  }
  if (!page.metaDescription) issues.push('missing_meta_description');
  else if (page.metaDescription.length > MAX_META_LENGTH) {
    issues.push(`meta_description_too_long: ${page.metaDescription.length} chars`);
  }
  if (!page.h1.length) issues.push('no_h1');
  else if (page.h1.length > 1) issues.push(`multiple_h1: ${page.h1.length}`);
  if (page.wordCount < EMPTY_PAGE_WORDS) {
    issues.push(
      `empty_server_html: ${page.wordCount} words (content is not in the HTML Google gets)`,
    );
  } else if (page.wordCount < THIN_PAGE_WORDS) {
    issues.push(`thin_content: ${page.wordCount} words`);
  }
  if (locale && page.htmlLang && !page.htmlLang.toLowerCase().startsWith(locale)) {
    issues.push(`html_lang_mismatch: lang=${page.htmlLang}, url locale=${locale}`);
  }
  if (locale && !page.hreflangs?.length) issues.push('no_hreflang');
  if (!page.structuredDataTypes.length) issues.push('no_structured_data');

  return issues;
};

const countMentions = (text: string | undefined, needle: string) => {
  if (!text || !needle) return 0;

  return text.toLowerCase().split(needle).length - 1;
};

/**
 * Downloads the live page and extracts what an SEO task usually changes
 * (title, meta description, headings, canonical, robots, structured data),
 * so the AI can tell whether the work is actually on the site.
 */
export const inspectMarketingPage = async (
  url: string,
  query?: string | null,
): Promise<MarketingPageInspection> => {
  try {
    const response = await axios.get<string>(url, {
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'text',
      maxContentLength: 5_000_000,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; TenderwizeBot/1.0; +https://tenderwize.com)',
        Accept: 'text/html',
      },
    });

    const $ = cheerio.load(
      typeof response.data === 'string' ? response.data : '',
    );
    const structuredDataTypes = new Set<string>();

    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const data: unknown = JSON.parse($(element).text());
        const nodes = (Array.isArray(data) ? data : [data]).flatMap((node) =>
          node && typeof node === 'object' && '@graph' in node
            ? (node as { '@graph': unknown[] })['@graph']
            : [node],
        );

        for (const node of nodes) {
          const type = (node as { '@type'?: unknown } | null)?.['@type'];
          for (const value of Array.isArray(type) ? type : [type]) {
            if (typeof value === 'string') structuredDataTypes.add(value);
          }
        }
      } catch {
        // Invalid JSON-LD is ignored; it is not what the task checks.
      }
    });

    const text = (selector: string) =>
      $(selector)
        .map((_, element) => $(element).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean)
        .slice(0, MAX_HEADINGS);
    const title = $('title').first().text().trim() || undefined;
    const metaDescription =
      $('meta[name="description"]').attr('content')?.trim() || undefined;
    const h1 = text('h1');
    const hreflangs = $('link[rel="alternate"][hreflang]')
      .map((_, element) => $(element).attr('hreflang'))
      .get()
      .filter(Boolean);
    const origin = new URL(url).origin;
    const internalLinks = new Set(
      $('a[href]')
        .map((_, element) => {
          try {
            const link = new URL($(element).attr('href') ?? '', url);
            return link.origin === origin ? link.pathname : undefined;
          } catch {
            return undefined;
          }
        })
        .get()
        .filter(Boolean),
    ).size;
    const headerRobots = response.headers['x-robots-tag'];
    const metaRobots = $('meta[name="robots"]').attr('content');

    $('script, style, noscript, iframe, svg').remove();

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const needle = query?.trim().toLowerCase() ?? '';

    return {
      url,
      httpStatus: response.status,
      title,
      metaDescription,
      h1,
      h2: text('h2'),
      canonical: $('link[rel="canonical"]').attr('href') || undefined,
      robots:
        [metaRobots, headerRobots && `X-Robots-Tag: ${String(headerRobots)}`]
          .filter(Boolean)
          .join('; ') || undefined,
      htmlLang: $('html').attr('lang') || undefined,
      hreflangs,
      internalLinks,
      structuredDataTypes: [...structuredDataTypes],
      wordCount: bodyText ? bodyText.split(' ').length : 0,
      ...(needle && {
        queryMentions: {
          title: countMentions(title, needle),
          metaDescription: countMentions(metaDescription, needle),
          h1: countMentions(h1.join(' '), needle),
          body: countMentions(bodyText, needle),
        },
      }),
    };
  } catch (error) {
    return {
      url,
      error: getSafeErrorMessage(error),
      h1: [],
      h2: [],
      structuredDataTypes: [],
      wordCount: 0,
    };
  }
};
