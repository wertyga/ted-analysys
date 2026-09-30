import { MARKETING_TASK_HISTORY_LIMIT } from './schemas/marketing-task.schema';
import {
  MarketingTaskHistoryEntry,
  SitePageTemplate,
} from './marketing-task.types';

/**
 * Rough organic CTR by average position. Used only to flag pages that get
 * clearly fewer clicks than their ranking should bring (a title/snippet
 * problem), so precision here is not important.
 */
export const expectedCtrForPosition = (position: number): number => {
  if (position < 1.5) return 0.28;
  if (position < 2.5) return 0.15;
  if (position < 3.5) return 0.1;
  if (position < 4.5) return 0.07;
  if (position < 5.5) return 0.05;
  if (position < 10.5) return 0.03;
  return 0.01;
};

/**
 * Reduces a page reference to a lowercase path without a trailing slash, so
 * a GSC full URL and a GA4 landing page path point to the same page.
 */
export const normalizePagePath = (pageUrl?: string | null): string => {
  if (!pageUrl) return '';

  let path = pageUrl.trim();

  try {
    path = new URL(path).pathname;
  } catch {
    // Already a path (GA4 landingPage).
  }

  path = path.split(/[?#]/)[0].toLowerCase();

  return path.length > 1 ? path.replace(/\/+$/, '') : path;
};

export const normalizeText = (value?: string | null) =>
  (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** CTR a query/page would get at position ~3, the target of content work. */
export const TARGET_POSITION_CTR = expectedCtrForPosition(3);

/** Clicks a row would gain by reaching `targetCtr`, never negative. */
export const estimateExtraClicks = (
  row: { impressions: number; ctr: number },
  targetCtr: number,
) => Math.max(0, Math.round(row.impressions * (targetCtr - row.ctr)));

const GUIDE_PATHS = new Set([
  'guides',
  'how-to-find-eu-tenders',
  'how-to-evaluate-a-tender-opportunity',
  'how-to-analyze-tender-documents-with-ai',
  'common-tender-requirements-in-europe',
]);
const TOOL_PATHS = new Set(['tender-search', 'explore']);
const LEGAL_PATHS = new Set(['privacy', 'terms', 'cookies']);
/** Logged-in app and auth routes (disallowed in robots.txt). */
const APP_PATHS = new Set([
  'dashboard',
  'deep-analyses',
  'opportunities',
  'wishlist',
  'settings',
  'onboarding',
  'checkout-redirect',
  'login',
  'register',
  'auth',
  'api',
]);
const LIST_TEMPLATES: Record<string, [SitePageTemplate, SitePageTemplate]> = {
  tenders: [SitePageTemplate.tool, SitePageTemplate.tender],
  buyers: [SitePageTemplate.buyer_list, SitePageTemplate.buyer],
  contractors: [SitePageTemplate.contractor_list, SitePageTemplate.contractor],
  industries: [SitePageTemplate.industry_list, SitePageTemplate.industry],
  countries: [SitePageTemplate.country_list, SitePageTemplate.country],
  compare: [SitePageTemplate.compare, SitePageTemplate.compare],
  guides: [SitePageTemplate.guide, SitePageTemplate.guide],
};

/**
 * Page template and locale of a tenderwize.com URL, following the sitemap
 * structure: /{locale}/tenders/{id}, /{locale}/buyers/{id},
 * /{locale}/{countrySlug}/{industrySlug}, static pages, etc.
 */
export const classifyPage = (
  pageUrl?: string | null,
): { template: SitePageTemplate; locale?: string } => {
  const segments = normalizePagePath(pageUrl).split('/').filter(Boolean);
  const hasLocale = /^[a-z]{2}(-[a-z]{2})?$/.test(segments[0] ?? '');
  const locale = hasLocale ? segments[0] : undefined;
  const [first, second, third] = hasLocale ? segments.slice(1) : segments;

  if (!first) return { template: SitePageTemplate.home, locale };

  if (first === 'award-tenders') {
    // /award-tenders and /award-tenders/country[/{slug}] are the directory.
    const isAward = second && second !== 'country';
    return {
      template: isAward
        ? SitePageTemplate.award_tender
        : SitePageTemplate.award_directory,
      locale,
    };
  }

  const list = LIST_TEMPLATES[first];
  if (list) return { template: second ? list[1] : list[0], locale };
  if (GUIDE_PATHS.has(first)) return { template: SitePageTemplate.guide, locale };
  if (TOOL_PATHS.has(first)) return { template: SitePageTemplate.tool, locale };
  if (LEGAL_PATHS.has(first)) return { template: SitePageTemplate.legal, locale };
  if (first === 'pricing') {
    return { template: SitePageTemplate.pricing, locale };
  }
  if (APP_PATHS.has(first)) return { template: SitePageTemplate.app, locale };
  if (second && !third) {
    return { template: SitePageTemplate.country_industry, locale };
  }

  return { template: SitePageTemplate.other, locale };
};

/**
 * Locales in which a template is indexable, mirroring `INDEXABLE_LOCALES` of
 * the frontend (`src/lib/seo/locale-indexing.ts`). Other locale versions are
 * deliberately noindex,follow with a canonical to /en and no hreflang.
 * Templates missing here (other) have no known rule.
 */
const EN_ONLY = ['en'];
const EN_DE_FR_PL = ['en', 'de', 'fr', 'pl'];
const INDEXABLE_LOCALES: Partial<Record<SitePageTemplate, string[]>> = {
  [SitePageTemplate.home]: EN_ONLY,
  [SitePageTemplate.tender]: EN_ONLY,
  [SitePageTemplate.award_tender]: EN_ONLY,
  [SitePageTemplate.award_directory]: EN_DE_FR_PL,
  [SitePageTemplate.buyer]: EN_ONLY,
  [SitePageTemplate.buyer_list]: EN_DE_FR_PL,
  [SitePageTemplate.contractor]: EN_ONLY,
  [SitePageTemplate.contractor_list]: EN_DE_FR_PL,
  [SitePageTemplate.industry]: EN_DE_FR_PL,
  [SitePageTemplate.industry_list]: EN_ONLY,
  [SitePageTemplate.country]: EN_DE_FR_PL,
  [SitePageTemplate.country_list]: EN_ONLY,
  [SitePageTemplate.country_industry]: EN_DE_FR_PL,
  [SitePageTemplate.guide]: EN_ONLY,
  [SitePageTemplate.compare]: EN_DE_FR_PL,
  [SitePageTemplate.tool]: EN_ONLY,
  [SitePageTemplate.pricing]: EN_ONLY,
  [SitePageTemplate.legal]: EN_ONLY,
  [SitePageTemplate.app]: [],
};

/** Indexable locales of a template, undefined when there is no known rule. */
export const getIndexableLocales = (
  template: SitePageTemplate,
): readonly string[] | undefined => INDEXABLE_LOCALES[template];

/**
 * False when the page is a locale version the site keeps out of the index on
 * purpose (e.g. /de/tenders/{id}); true when it is meant to rank or the rule
 * is unknown.
 */
export const isIndexableLocaleVersion = (pageUrl?: string | null) => {
  const { template, locale } = classifyPage(pageUrl);
  const locales = INDEXABLE_LOCALES[template];

  return !locale || !locales || locales.includes(locale);
};

/** The /en counterpart of a localized page path (/de/tenders/1 -> /en/tenders/1). */
export const toDefaultLocalePath = (pageUrl?: string | null) => {
  const { locale } = classifyPage(pageUrl);
  const path = normalizePagePath(pageUrl);

  return locale ? path.replace(`/${locale}`, '/en') : path;
};

/**
 * Key used to recognize "the same task" across analysis runs: one task per
 * category + page + query, or per category + template for template-wide
 * work. Title is only used when a task has none of these (e.g. a site-wide
 * tracking task).
 */
export const buildMarketingTaskFingerprint = (task: {
  category: string;
  pageUrl?: string | null;
  query?: string | null;
  template?: string | null;
  title: string;
}): string => {
  const page = normalizePagePath(task.pageUrl);
  const query = normalizeText(task.query);
  const subject = task.template
    ? `template:${task.template}`
    : normalizeText(task.title);

  return [task.category, page, query, page || query ? '' : subject].join('|');
};

/** `$push` fragment that appends history entries and keeps the list capped. */
export const pushMarketingTaskHistory = (
  entries: MarketingTaskHistoryEntry[],
) => ({
  $push: {
    history: { $each: entries, $slice: -MARKETING_TASK_HISTORY_LIMIT },
  },
});
