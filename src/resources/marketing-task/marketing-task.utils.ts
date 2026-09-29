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
const LIST_TEMPLATES: Record<string, [SitePageTemplate, SitePageTemplate]> = {
  tenders: [SitePageTemplate.tool, SitePageTemplate.tender],
  'award-tenders': [SitePageTemplate.tool, SitePageTemplate.award_tender],
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

  const list = LIST_TEMPLATES[first];
  if (list) return { template: second ? list[1] : list[0], locale };
  if (GUIDE_PATHS.has(first)) return { template: SitePageTemplate.guide, locale };
  if (TOOL_PATHS.has(first)) return { template: SitePageTemplate.tool, locale };
  if (LEGAL_PATHS.has(first)) return { template: SitePageTemplate.legal, locale };
  if (second && !third) {
    return { template: SitePageTemplate.country_industry, locale };
  }

  return { template: SitePageTemplate.other, locale };
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
