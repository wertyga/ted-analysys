import { z } from 'zod';
import { formatDate } from '@/utils';
import {
  MarketingDataSnapshot,
  MarketingTaskCategory,
  MarketingTaskHistoryEntry,
  MarketingTaskMetrics,
  Priority,
} from '../marketing-task.types';

export const MARKETING_TASK_LLM_ITEM_SCHEMA = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(MarketingTaskCategory),
  priority: z.enum(Priority),
  pageUrl: z.string().nullable().optional(),
  query: z.string().nullable().optional(),
  evidence: z.string().min(1),
  expectedImpact: z.string().nullable().optional(),
});

export const MARKETING_TASK_LLM_REVIEW_SCHEMA = z.object({
  taskId: z.string().min(1),
  note: z.string().min(1),
  summary: z.string().nullable().optional(),
});

export const MARKETING_TASK_LLM_RESPONSE_SCHEMA = z.object({
  tasks: z.array(z.unknown()),
  reviews: z.array(z.unknown()).optional().default([]),
});

export type MarketingTaskLlmItem = z.infer<
  typeof MARKETING_TASK_LLM_ITEM_SCHEMA
>;
export type MarketingTaskLlmReview = z.infer<
  typeof MARKETING_TASK_LLM_REVIEW_SCHEMA
>;

const MARKETING_TASK_LLM_JSON_SCHEMA = z.toJSONSchema(
  z.object({
    tasks: z.array(MARKETING_TASK_LLM_ITEM_SCHEMA),
    reviews: z.array(MARKETING_TASK_LLM_REVIEW_SCHEMA),
  }),
);

export interface MarketingTaskPromptRejectedTask {
  title: string;
  category: string;
  pageUrl?: string;
  query?: string;
}

export interface MarketingTaskPromptHistoryEntry {
  date: string;
  by: string;
  type: string;
  text?: string;
  status?: string;
  metrics?: MarketingTaskMetrics;
  period?: string;
  verdict?: string;
  effect?: string;
}

export const toPromptHistoryEntry = (
  entry: MarketingTaskHistoryEntry,
): MarketingTaskPromptHistoryEntry => ({
  date: formatDate(new Date(entry.at)),
  by: entry.actor,
  type: entry.type,
  text: entry.text,
  status: entry.status,
  metrics: entry.metrics,
  period: entry.periodStart && `${entry.periodStart}..${entry.periodEnd}`,
  verdict: entry.verdict,
  effect: entry.effect,
});

/** An open or recently completed task, with the context of its progress. */
export interface MarketingTaskPromptTrackedTask {
  id: string;
  title: string;
  description: string;
  category: string;
  pageUrl?: string;
  query?: string;
  status: string;
  createdAt?: string;
  completedAt?: string;
  notes?: string;
  summary?: string;
  /** Earliest recorded metrics, i.e. the state before the work started. */
  baselineMetrics?: MarketingTaskMetrics;
  currentMetrics?: MarketingTaskMetrics;
  recentHistory: MarketingTaskPromptHistoryEntry[];
}

export const buildMarketingTaskSystemPrompt = ({
  maxTasks,
  language,
}: {
  maxTasks: number;
  language: string;
}) =>
  [
    'You are a senior SEO and growth analyst for Tenderwize (tenderwize.com), a SaaS that helps companies find and analyze EU public tenders from TED.',
    'You receive a pre-aggregated snapshot of Google Search Console and Google Analytics 4 data for the current period compared with the previous period of the same length, the tasks being tracked (open and recently done, with their history) and recently rejected tasks.',
    `Your job: (1) produce up to ${maxTasks} new concrete, actionable tasks describing what to fix or improve on the site, ordered from most to least impactful; (2) review the progress of the tracked tasks.`,
    '',
    'Rules:',
    '- Every task MUST be grounded in the numbers from the snapshot. Put the exact metrics that justify it into "evidence" (e.g. "1 240 impressions, CTR 0.4%, avg position 3.2; expected CTR ~10%"). Never invent numbers or pages.',
    '- "description" must say exactly what to do (which title/meta to rewrite and in what direction, which section to add, which query to target, what to check), not generic advice like "improve SEO".',
    '- One task = one page or one query or one site-wide issue. Set "pageUrl" and/or "query" whenever the task is about a specific page/query; use null otherwise.',
    '- Do NOT create a task that duplicates an open tracked task (same category + page + query), and do NOT re-suggest rejected tasks. A follow-up for a done task is allowed only when its review shows the work had no effect.',
    '- Categories: ctr = low CTR at a good position (snippet problem); content = improve existing page for striking-distance queries (positions 4-20); content_gap = queries with impressions but no relevant page; technical = indexing/linking/speed/mobile/structured data; conversion = landing pages with poor engagement or no key events; traffic_drop = pages/channels losing clicks or sessions; tracking = missing or broken analytics data.',
    '- Priority: high = large traffic or conversion effect with clear evidence; medium = noticeable effect; low = small or uncertain.',
    '- If the data is too thin to justify a task, return fewer tasks. An empty list is acceptable.',
    '',
    'Reviews of tracked tasks:',
    '- Each tracked task has its history: admin comments (what was actually done on the site, blockers, questions), status changes, your previous reviews and metrics from earlier runs. Read it to understand where the task stands before writing anything.',
    '- Return a review ({"taskId", "note", "summary"}) for a tracked task when there is something new: metrics moved, an admin comment needs an answer or a next step, or a done task can be evaluated. Skip tasks with nothing new.',
    '- "note": 1-3 sentences on what changed since the last review and what to do next, grounded in currentMetrics vs baselineMetrics and earlier history metrics. Metrics are totals over their period and periods differ in length (e.g. 14-day checks vs the analysis period): compare them per day. Do not repeat earlier notes.',
    '- For done tasks, judge whether the work had an effect (compare metrics before completedAt with currentMetrics). Search data needs 2-4 weeks after a change; say so instead of concluding too early.',
    '- "summary": the updated overall state of the task in at most 500 characters (what was done, current effect, what is next). It replaces the previous summary.',
    '- "taskId" must be the "id" of a tracked task exactly as given.',
    '',
    `- Write "title", "description", "evidence", "expectedImpact", "note" and "summary" in language: ${language}. Keep page URLs and search queries as they are in the data.`,
    '- Title: at most 120 characters. Description: at most 1500 characters.',
    '',
    'Return JSON only. The JSON must match this schema:',
    JSON.stringify(MARKETING_TASK_LLM_JSON_SCHEMA),
  ].join('\n');

export const buildMarketingTaskUserPrompt = ({
  snapshot,
  trackedTasks,
  rejectedTasks,
}: {
  snapshot: MarketingDataSnapshot;
  trackedTasks: MarketingTaskPromptTrackedTask[];
  rejectedTasks: MarketingTaskPromptRejectedTask[];
}) =>
  [
    'DATA SNAPSHOT',
    JSON.stringify(snapshot),
    '',
    'TRACKED TASKS (open and recently done)',
    trackedTasks.length ? JSON.stringify(trackedTasks) : 'none',
    '',
    'RECENTLY REJECTED TASKS',
    rejectedTasks.length ? JSON.stringify(rejectedTasks) : 'none',
  ].join('\n');
