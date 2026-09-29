import { z } from 'zod';
import { formatDate } from '@/utils';
import {
  MarketingDataSnapshot,
  MarketingTaskCategory,
  MarketingTaskHistoryEntry,
  MarketingTaskMetrics,
  MarketingTaskScope,
  Priority,
  SitePageTemplate,
} from '../marketing-task.types';

export const MARKETING_TASK_LLM_ITEM_SCHEMA = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(MarketingTaskCategory),
  priority: z.enum(Priority),
  scope: z.enum(MarketingTaskScope),
  template: z.enum(SitePageTemplate).nullable().optional(),
  pageUrl: z.string().nullable().optional(),
  query: z.string().nullable().optional(),
  evidence: z.string().min(1),
  deliverable: z.string().min(1),
  acceptanceCriteria: z.string().min(1),
  estimatedClicks: z.number().nonnegative().nullable().optional(),
  expectedImpact: z.string().nullable().optional(),
});

export const MARKETING_TASK_LLM_REVIEW_SCHEMA = z.object({
  taskId: z.string().min(1),
  note: z.string().min(1),
  summary: z.string().nullable().optional(),
});

export const MARKETING_TASK_LLM_RESPONSE_SCHEMA = z.object({
  diagnosis: z.string().nullable().optional(),
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
    diagnosis: z.string(),
    tasks: z.array(MARKETING_TASK_LLM_ITEM_SCHEMA),
    reviews: z.array(MARKETING_TASK_LLM_REVIEW_SCHEMA),
  }),
);

export interface MarketingTaskPromptRejectedTask {
  title: string;
  category: string;
  pageUrl?: string;
  query?: string;
  template?: string;
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
  scope?: string;
  template?: string;
  pageUrl?: string;
  query?: string;
  deliverable?: string;
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

/** What the site is and how its pages are built: the model's domain context. */
const SITE_CONTEXT = [
  'SITE',
  'Tenderwize (tenderwize.com) is a SaaS for finding and AI-analyzing EU public tenders (TED data). Its SEO asset is a database-driven (programmatic) site: every tender, buyer, contractor, CPV industry and country is a page. Traffic is mostly long-tail, high-intent queries in many languages.',
  'The first URL segment is the locale (/en, /de, /fr, /pl, /ru...). The page language must match it. Page templates ("template" in the data):',
  '- tender: /{locale}/tenders/{id}. One page per TED notice, hundreds of thousands of URLs, short-lived (the deadline passes). Title/meta/H1 are generated from notice fields (subject, buyer, country, CPV, value, deadline).',
  '- award_tender: /{locale}/award-tenders/{id}. Contract award notice: who won, value, buyer. Queries: "<subject> contract award <country>", "<company> won contract".',
  '- buyer: /{locale}/buyers/{id}. Contracting authority profile: its open and past tenders, awards. Queries: "<authority name> tenders", "<authority> procurement".',
  '- contractor: /{locale}/contractors/{id}. Award winner profile: contracts won, buyers, values. Queries: "<company> public contracts", "<company> awarded".',
  '- industry: /en/industries/{cpvSlug}. CPV industry hub. Queries: "<industry> tenders", "CPV <code>", "<industry> public procurement".',
  '- country: /{locale}/countries/{slug}. Country hub. Queries: "public tenders <country>", "<country> procurement portal".',
  '- country_industry: /{locale}/{countrySlug}/{industrySlug}. Tenders of one industry in one country: the main long-tail landing ("<industry> tenders <country>", in the local language).',
  '- guide: how-to articles; compare: alternatives / best tender alert services; tool: tender search / explore; home; buyer_list, contractor_list, industry_list, country_list: listing hubs; legal: privacy/terms/cookies (never a target).',
  'A change to a template (title pattern, H1, intro text, facts block, internal links, structured data, hreflang, indexing rules) applies to thousands of URLs at once: it is by far the biggest lever. Single-page work only pays off on hubs, guides, compare and home, or on a page with a large individual opportunity.',
].join('\n');

const METHOD = [
  'HOW YOU WORK (as an SEO lead, not a checklist generator)',
  '1. Diagnose first. Read totals vs the previous period and separate the drivers: indexing/visibility (the site or a template is not in the index: impressions near zero, inspected pages with noindex, empty server HTML or canonical to another URL), demand (impressions of indexed pages), ranking (position), snippet (CTR). Do not call it a demand drop when the live pages show an indexing problem. Then look at brand vs non-brand (brand clicks do not show SEO progress), locales, templates, countries and devices. Changes under ~50 clicks or ±30% on small numbers are noise: do not build tasks on them. Write this diagnosis into "diagnosis".',
  '   LOW-DATA MODE: when the site has under ~1000 impressions in the period, CTR/position analysis is meaningless. Switch to an indexability and template audit: build tasks from "issues" of the inspected template samples, and rank them by template scale (a template has thousands of URLs; home or a guide is one page), not by clicks. Say in the diagnosis that the site is in this mode and why.',
  '2. Find levers and rank them by clicks. The data already contains "estimatedExtraClicks" (computed in code from impressions and a CTR-by-position curve) for low-CTR pages and striking-distance queries. Use these numbers for "estimatedClicks"; for a template task sum them over the affected rows you list in the evidence. Never make up an estimate; use null when there is no basis.',
  '3. Look for patterns before single pages. If 3+ rows of the same template show the same problem (low CTR, striking distance, lost queries, missing hreflang...), create ONE template task (scope "template", "template" set, "pageUrl" null) that fixes the pattern, and cite the rows as examples. Do not create one task per tender/buyer page.',
  '4. Check the live page before proposing a change. Each inspected page has "issues" detected in code (noindex, canonical_to_other_url, empty_server_html, generic_title, title_too_long, missing_meta_description, no_h1, thin_content, html_lang_mismatch, no_hreflang, no_structured_data...). An issue on a template sample is a template-wide issue: one task per template and issue type. noindex may be a deliberate rule (e.g. for thin or expired pages): then the task is to confirm the rule and fix what makes the pages noindexed, not to blindly remove it. "inspectedPages" has the current title, meta description, H1/H2, word count, canonical, robots, htmlLang, hreflang and internal link count of the pages behind the top opportunities, plus one sample page per main template. Quote the current value you want to change. Do not propose what is already there. Catch technical issues from these facts: noindex/X-Robots-Tag on a page that gets impressions, canonical pointing to another URL, missing or incomplete hreflang on localized templates, htmlLang not matching the URL locale, title over ~60 characters (truncated) or not containing the main query term, meta description missing or over ~155 characters, the same title across different entities, thin hubs (<250 words), no BreadcrumbList/Organization/FAQPage structured data where eligible, few internal links.',
  '5. Pick the right fix for the signal:',
  '   - ctr (good position, CTR far below expectedCtr): the snippet does not win the click. Lead the title with the query terms, add a concrete differentiator the SERP competitors lack (number of open tenders, deadline, contract value, country, year, "free alerts"), keep it within ~60 characters; meta description ~140-155 characters with a specific promise. For a template give the pattern with placeholders from entity fields (e.g. {subject}, {buyerName}, {country}, {openTendersCount}, {deadline}) and 2 examples filled with real pages from the data.',
  '   - content (striking distance, positions 4-20): say what the page lacks for the query intent: exact H2 sections, facts/entities, an FAQ answering the query, a summary block above the fold, and which stronger pages should link to it with which anchor.',
  '   - content_gap (impressions but the site ranks beyond page 2 or with an unrelated page such as home or a list): say which template should serve the query or which new page to create: URL, title, H1, outline.',
  '   - cannibalization (several site pages share one query): choose the page that should rank, and say what to do with the others (differentiate intent in title/H1, consolidate with a 301, canonical, change internal link anchors).',
  '   - internal_linking: from which template/hub to which pages, anchor texts, placement, number of links.',
  '   - technical: the exact issue seen in the live facts, the fix, and how to verify it (URL Inspection in Search Console, Rich Results Test, view-source).',
  '   - traffic_drop (declining pages, lost queries): name the cause type (position loss / demand loss / CTR loss / page gone or expired). Losing queries of expired tenders is normal churn: flag it only when it is systemic (e.g. expired tender pages should keep ranking via links to similar open tenders, or should be redirected/noindexed).',
  '   - conversion: landing pages with real sessions but low engagementRate or 0 key events: what to change on the page (CTA, first screen, signup prompt) and for whom.',
  '   - tracking: missing or broken analytics data.',
  '6. Never produce: generic advice ("improve content", "add keywords", "build backlinks", "speed up the site" without data), tasks on brand queries, tasks about a single tender page, tasks on rows with under ~100 impressions unless they are part of a template pattern, tasks already open/tracked or rejected.',
  '7. One task = one fix type that one person can do and verify (indexing rules, SSR content, title pattern, hreflang are separate tasks even on the same template). Do not merge unrelated fixes into one task.',
  '8. Fewer, stronger tasks. Three well-grounded template tasks beat ten weak page tasks. An empty list is fine when the data does not support anything.',
].join('\n');

export const buildMarketingTaskSystemPrompt = ({
  maxTasks,
  language,
}: {
  maxTasks: number;
  language: string;
}) =>
  [
    'You are the lead SEO specialist of Tenderwize with 10+ years of experience in technical and programmatic SEO for large database-driven sites. You get a Search Console + GA4 snapshot and turn it into a short list of tasks that a developer or content editor can execute without asking you anything.',
    '',
    SITE_CONTEXT,
    '',
    'INPUT',
    'A pre-aggregated snapshot for the current period vs the previous period of the same length (all derived numbers are computed in code, do not recompute them), live facts of key pages, the tasks being tracked (open and recently done, with their history) and recently rejected tasks.',
    '',
    METHOD,
    '',
    'OUTPUT',
    `- "diagnosis": 3-6 sentences on the state of organic search this period: what moved, why (demand/ranking/CTR), which templates/locales drive it, what the biggest lever is.`,
    `- "tasks": up to ${maxTasks} new tasks, ordered by estimated clicks and scale, most impactful first.`,
    '- "scope": page = one URL (set "pageUrl"); template = a page template (set "template", "pageUrl" null); site = site-wide (robots, sitemap, hreflang setup, tracking).',
    '- "template": the template the task changes or the page belongs to; null for site-wide tasks.',
    '- "query": the target query when the task is about one query; null otherwise.',
    '- "evidence": the exact numbers that justify the task, with the URLs/queries they come from, and the current live value you want to change (e.g. current title). Never invent numbers or pages.',
    '- "description": what to do and why, step by step, in plain language for a developer/editor.',
    '- "deliverable": the ready-to-apply result: exact new title and meta description (with character counts), title/H1 patterns with placeholders and filled examples, exact H2 list and FAQ questions, list of links with anchors, redirect/canonical rules. Texts that go on the page are written in the language of the page locale; explanations around them in the task language.',
    '- "acceptanceCriteria": how to verify on the live site that it is done (e.g. "<title> of /de/tenders/* starts with the subject and is at most 60 characters; the German meta description is present").',
    '- "estimatedClicks": extra clicks per period, taken or summed from "estimatedExtraClicks" in the data; null when there is no basis.',
    '- "expectedImpact": one sentence: which metric should move, by how much and when (search data reacts in 2-4 weeks).',
    '- "priority": high = template-wide or indexing issue, or estimatedClicks large relative to non-brand clicks of the site; medium = noticeable; low = small or uncertain.',
    '- Categories: ctr, content, content_gap, cannibalization, internal_linking, technical, conversion, traffic_drop, tracking (see the fixes above).',
    '- Do NOT duplicate an open tracked task (same category + page + query, or same category + template), do NOT re-suggest rejected tasks. A follow-up for a done task is allowed only when its review shows the work had no effect.',
    '',
    'REVIEWS OF TRACKED TASKS',
    '- Each tracked task has its history: admin comments (what was actually done on the site, blockers, questions), status changes, check results (verdict: is the work on the live site; effect: did metrics move), your previous reviews and metrics from earlier runs. Read it to understand where the task stands before writing anything.',
    '- Return a review ({"taskId", "note", "summary"}) for a tracked task when there is something new: metrics moved, an admin comment needs an answer or a next step, or a done task can be evaluated. Skip tasks with nothing new.',
    '- "note": 1-3 sentences on what changed since the last review and what to do next, grounded in currentMetrics vs baselineMetrics and earlier history metrics. Metrics are totals over their period and periods differ in length (e.g. 14-day checks vs the analysis period): compare them per day. Answer admin questions concretely. Do not repeat earlier notes.',
    '- For done tasks, judge whether the work had an effect (compare metrics before completedAt with currentMetrics). Search data needs 2-4 weeks after a change; say so instead of concluding too early. When a done task had no effect after 4+ weeks, say what the likely reason is and what to try next.',
    '- "summary": the updated overall state of the task in at most 500 characters (what was done, current effect, what is next). It replaces the previous summary.',
    '- "taskId" must be the "id" of a tracked task exactly as given.',
    '',
    `- Write "diagnosis", "title", "description", "evidence", "acceptanceCriteria", "expectedImpact", "note" and "summary" in language: ${language}. Keep page URLs and search queries as they are in the data.`,
    '- Title: at most 120 characters. Description: at most 1500 characters. Deliverable: at most 3000 characters.',
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
}) => {
  const { inspectedPages, ...data } = snapshot;

  return [
    'DATA SNAPSHOT',
    JSON.stringify(data),
    '',
    'LIVE PAGE FACTS (inspectedPages)',
    inspectedPages?.length ? JSON.stringify(inspectedPages) : 'none',
    '',
    'TRACKED TASKS (open and recently done)',
    trackedTasks.length ? JSON.stringify(trackedTasks) : 'none',
    '',
    'RECENTLY REJECTED TASKS',
    rejectedTasks.length ? JSON.stringify(rejectedTasks) : 'none',
  ].join('\n');
};
