import { MARKETING_TASK_HISTORY_LIMIT } from './schemas/marketing-task.schema';
import { MarketingTaskHistoryEntry } from './marketing-task.types';

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

/**
 * Key used to recognize "the same task" across analysis runs: one task per
 * category + page + query. Title is only used when a task has neither a
 * page nor a query (e.g. a site-wide tracking task).
 */
export const buildMarketingTaskFingerprint = (task: {
  category: string;
  pageUrl?: string | null;
  query?: string | null;
  title: string;
}): string => {
  const page = normalizePagePath(task.pageUrl);
  const query = normalizeText(task.query);

  return [
    task.category,
    page,
    query,
    page || query ? '' : normalizeText(task.title),
  ].join('|');
};

/** `$push` fragment that appends history entries and keeps the list capped. */
export const pushMarketingTaskHistory = (
  entries: MarketingTaskHistoryEntry[],
) => ({
  $push: {
    history: { $each: entries, $slice: -MARKETING_TASK_HISTORY_LIMIT },
  },
});
