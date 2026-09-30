import { z } from 'zod';
import {
  MarketingPageInspection,
  MarketingTaskCheckEffect,
  MarketingTaskCheckVerdict,
  MarketingTaskMetrics,
  MarketingTaskMetricsComparison,
} from '../marketing-task.types';
import {
  getSiteBrief,
  MarketingTaskPromptHistoryEntry,
} from './marketing-task.prompt';

export const MARKETING_TASK_CHECK_LLM_SCHEMA = z.object({
  verdict: z.enum(MarketingTaskCheckVerdict),
  effect: z.enum(MarketingTaskCheckEffect),
  note: z.string().min(1),
  summary: z.string().min(1),
});

export type MarketingTaskCheckLlmResult = z.infer<
  typeof MARKETING_TASK_CHECK_LLM_SCHEMA
>;

const MARKETING_TASK_CHECK_JSON_SCHEMA = z.toJSONSchema(
  MARKETING_TASK_CHECK_LLM_SCHEMA,
);

export interface MarketingTaskCheckPromptInput {
  today: string;
  task: {
    title: string;
    description: string;
    category: string;
    status: string;
    scope?: string;
    template?: string;
    pageUrl?: string;
    query?: string;
    evidence?: string;
    deliverable?: string;
    acceptanceCriteria?: string;
    createdAt?: string;
    completedAt?: string;
    notes?: string;
    summary?: string;
  };
  baselineMetrics?: MarketingTaskMetrics & { period?: string };
  metrics: MarketingTaskMetricsComparison;
  livePage?: MarketingPageInspection;
  history: MarketingTaskPromptHistoryEntry[];
}

export const buildMarketingTaskCheckSystemPrompt = (language: string) =>
  [
    'You are the lead SEO specialist of Tenderwize (tenderwize.com), a SaaS that helps companies find and analyze EU public tenders from TED. The site is database-driven: tender, buyer, contractor, industry, country and country+industry pages are generated from templates.',
    'An admin asked you to check ONE improvement task: is the work done on the live site, and did it have an effect?',
    '',
    'SITE BRIEF (templates, title patterns, intentional indexing rules: noindex / canonical to /en on non-indexable locale versions is expected)',
    getSiteBrief(),
    '',
    'You receive: the task, its history (admin comments about what was done, status changes, earlier reviews and metrics), baseline metrics recorded when the task was created, fresh metrics of exactly this page/query for the recent period and the period before it, and facts extracted from the live HTML of the page.',
    '',
    'How to judge:',
    '- "verdict": compare the task "deliverable" and "acceptanceCriteria" with the live page facts, point by point. E.g. a ctr task: is the live title/meta description the proposed one (or follows the proposed pattern), within the length limits, and does it contain the query; a content task: are the proposed H2 sections present, query mentions, word count; a technical task: canonical, robots, hreflang, htmlLang. For a template task the live page is a sample of the template: judge the pattern, not the exact text. Admin comments say what was done, but trust the live page over the comments. "partially" = some criteria met; list which are missing.',
    '- "evidence" describes the page as it was when the task was created, before the work; never report it as the current state. Current page facts come only from "livePage" (its "url" is the page that was fetched). Without "livePage" say that the live page was not inspected and use "unclear".',
    '- Use "unclear" when the live page cannot confirm it (fetch error, the change is off-page like links or speed, or the page looks client-rendered: almost no words in the HTML).',
    '- "effect": compare metrics.current with metrics.previous and with baselineMetrics. Judge the metric the task targets (CTR for ctr tasks, position/impressions for content tasks, clicks for traffic_drop) and keep in mind that impressions depend on demand: a CTR gain with falling impressions can still be a positive effect. Metrics are totals over their period: compare periods of different length per day. Search Console needs 2-4 weeks after a change to reflect it: use "too_early" when the change is more recent than that. Use "unknown" when there are no metrics.',
    '- Never invent numbers or page content; quote the exact title/metrics you relied on.',
    `- "note": 2-5 sentences in language ${language}: what you checked, what you found (with the concrete title/metric values), the conclusion and the next step.`,
    `- "summary": the updated overall state of the task in at most 500 characters in language ${language}; it replaces the previous summary.`,
    '',
    'Return JSON only. The JSON must match this schema:',
    JSON.stringify(MARKETING_TASK_CHECK_JSON_SCHEMA),
  ].join('\n');

export const buildMarketingTaskCheckUserPrompt = (
  input: MarketingTaskCheckPromptInput,
) => JSON.stringify(input);
