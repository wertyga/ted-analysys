import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { TenderModel } from '@/resources/tenders/schemas';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { tenderPopulateFields, awardTenderPopulateFields } from '@/utils';
import { XPostPillar } from './schemas/x-post.schema';
import {
  DetectedCompanyStory,
  detectCompanyStoryPattern,
} from './company-story-detector';
import {
  DetectedInterestingTender,
  TenderCandidateFacts,
  detectInterestingTenderPattern,
} from './interesting-tender-detector';
import { MarketSliceStats } from './market-insight-detector';

export const TENDERWIZE_ORIGIN = 'https://tenderwize.com';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface XPostToolRecord {
  id: string;
  summary: string;
}

export interface XPostToolExecution {
  result: unknown;
  records: XPostToolRecord[];
}

export interface CompanyStoryCandidate {
  winnerId: string;
  winnerName: string;
}

export interface CompanyStoryAwardRef {
  id: string;
  title: string;
  buyerNames: string[];
  countries: string[];
  cpvCodes: string[];
  valueEur: number | null;
  date: string | null;
}

export interface CompanyStoryFacts {
  winnerId: string;
  winnerName: string;
  /** How many award records in our data name this winner — never "total wins", we only see a partial market view. */
  awardCount: number;
  /** Sum of awardValueEur across awards where that field is known; already EUR-normalized so it's safe to sum. Null if no award has a known value. */
  knownTotalValueEur: number | null;
  firstAwardDate: string | null;
  latestAwardDate: string | null;
  /** Chronologically earliest award — the "before" side of a growth arc (paired with largestAward/latestAward as the "after"). */
  firstAward: CompanyStoryAwardRef | null;
  latestAward: CompanyStoryAwardRef | null;
  largestAward: (CompanyStoryAwardRef & { valueEur: number }) | null;
  /** Days between firstAwardDate and latestAwardDate — precomputed so the model never does its own date arithmetic. Null if fewer than 2 dated awards. */
  spanDays: number | null;
  buyerNames: string[];
  /** The buyer this supplier has won from more than once, if any — a real, backend-counted relationship signal (not just presence in buyerNames). */
  topRepeatBuyer: { name: string; awardCount: number } | null;
  countries: string[];
  /**
   * Every dated award for this supplier, oldest first, so the model can look
   * for a pattern itself (buyer diversification, CPV specialization, an
   * anomalous outlier, an accelerating pace) instead of being limited to the
   * few aggregates above. Trimmed to the oldest + most recent entries when
   * the full history is long, since both ends matter for a before/after
   * contrast; see awardTimelineTruncatedCount for how many were cut.
   */
  awardTimeline: CompanyStoryAwardRef[];
  /** How many awards were omitted from awardTimeline (0 if nothing was cut). */
  awardTimelineTruncatedCount: number;
  /**
   * The single, statistically-confirmed pattern found in this supplier's
   * full award history (see company-story-detector.ts), or null if nothing
   * cleared COMPANY_STORY_REQUIRED_SCORE. This is computed deterministically
   * by the backend — the LLM is only ever given this already-confirmed
   * pattern to write about, never the raw numbers plus an instruction to
   * "find a story" in them (see X_POSTS_GUIDELINES.md "Company Story").
   */
  detectedStory: DetectedCompanyStory | null;
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const num =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value)
      : fallback;

  return Math.min(max, Math.max(min, num));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  );
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * These tools only ever surface the *Eur-converted value fields (never the
 * tender's original, possibly non-EUR, currency amount) — so the unit is
 * always EUR. Never pair this with a tender/award's original `currency`
 * field, which can be e.g. PLN, CZK, SEK and would mislabel the amount.
 */
function formatEurAmount(amount: number | null | undefined): string {
  if (typeof amount !== 'number') return 'unknown amount';

  return `${amount.toLocaleString('en-US')} EUR`;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return 'unknown date';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'unknown date'
    : date.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function extractBuyerTendersCount(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;

  const stats = (value as Record<string, unknown>).stats;

  if (!stats || typeof stats !== 'object') return null;

  const count = (stats as Record<string, unknown>).tendersCount;

  return typeof count === 'number' ? count : null;
}

function extractName(value: unknown): string {
  if (!value) return 'unknown';
  if (typeof value === 'string') return value;

  if (
    typeof value === 'object' &&
    'name' in (value as Record<string, unknown>)
  ) {
    const name = (value as Record<string, unknown>).name;

    return typeof name === 'string' && name.trim() ? name : 'unknown';
  }

  return 'unknown';
}

const SEARCH_OPEN_TENDERS_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_open_tenders',
    description:
      "Search Tenderwize's real database of currently open public tenders (submission deadline in the future). Use this for the Interesting Tender pillar. Returned monetary amounts are always in EUR, already converted. IMPORTANT: when a result's isDps or isFrameworkAgreement is true, its estimatedValueEur is a ceiling/indicative maximum spread over the whole mechanism's lifetime, not a single purchase — phrase it as such (e.g. 'a ceiling of', 'up to') and mention the mechanism (dynamic purchasing system / framework agreement) explicitly; never imply a single lump-sum contract.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Free-text keyword to match in the tender title/description, e.g. "hospital", "IT infrastructure".',
        },
        countries: {
          type: 'array',
          items: { type: 'string' },
          description: 'ISO 3166-1 alpha-3 country codes, e.g. ["NOR","SWE"].',
        },
        cpvCodePrefixes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'CPV code prefixes to filter by, e.g. ["33"] for medical equipment.',
        },
        minValueEur: {
          type: 'number',
          description: 'Minimum estimated value in EUR.',
        },
        maxValueEur: {
          type: 'number',
          description: 'Maximum estimated value in EUR.',
        },
        sortBy: {
          type: 'string',
          enum: ['value_desc', 'deadline_soonest', 'newest'],
          description: 'Sort order. Defaults to value_desc.',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (1-10). Defaults to 5.',
        },
      },
    },
  },
};

const SEARCH_CONTRACT_AWARDS_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_contract_awards',
    description:
      "Search Tenderwize's real database of completed contract awards (who bought, who won, how much). Use this for the Contract Award pillar. Returned monetary amounts are always in EUR, already converted. IMPORTANT: when a result's isDps or isFrameworkAgreement is true, its awardValueEur is a ceiling/indicative maximum over the whole mechanism's lifetime, not a lump sum paid to the winner — phrase it as such (e.g. 'a ceiling of', 'up to') and mention the mechanism (dynamic purchasing system / framework agreement) explicitly; never imply the winner was paid that amount outright.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Free-text keyword to match in the award title/description.',
        },
        countries: {
          type: 'array',
          items: { type: 'string' },
          description: 'ISO 3166-1 alpha-3 country codes.',
        },
        cpvCodePrefixes: {
          type: 'array',
          items: { type: 'string' },
          description: 'CPV code prefixes to filter by.',
        },
        minAwardValueEur: {
          type: 'number',
          description: 'Minimum awarded value in EUR.',
        },
        maxAwardValueEur: {
          type: 'number',
          description: 'Maximum awarded value in EUR.',
        },
        awardedWithinDays: {
          type: 'number',
          description:
            'Only include awards published within this many days. Defaults to 365.',
        },
        sortBy: {
          type: 'string',
          enum: ['value_desc', 'newest'],
          description: 'Sort order. Defaults to value_desc.',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (1-10). Defaults to 5.',
        },
      },
    },
  },
};

const GET_MARKET_STATS_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_market_stats',
    description:
      "Compute a real aggregate statistic from Tenderwize's database (tender/award counts or value sums) over a period, optionally compared to the prior equal-length period. Use this for the Market Insight pillar.",
    parameters: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: [
            'tenders_published',
            'awards_count',
            'tenders_value_sum_eur',
            'awards_value_sum_eur',
          ],
          description: 'Which statistic to compute.',
        },
        periodDays: {
          type: 'number',
          description:
            'Length of the period in days, ending now. Defaults to 90.',
        },
        countries: {
          type: 'array',
          items: { type: 'string' },
          description: 'ISO 3166-1 alpha-3 country codes to filter by.',
        },
        cpvCodePrefixes: {
          type: 'array',
          items: { type: 'string' },
          description: 'CPV code prefixes to filter by.',
        },
        query: {
          type: 'string',
          description: 'Free-text keyword to filter title/description by.',
        },
        compareToPreviousPeriod: {
          type: 'boolean',
          description:
            'Whether to also compute the prior equal-length period for comparison. Defaults to true.',
        },
      },
      required: ['metric'],
    },
  },
};

@Injectable()
export class XPostDataService {
  getToolsForPillar(pillar: XPostPillar): ChatCompletionTool[] {
    if (pillar === XPostPillar.InterestingTender)
      return [SEARCH_OPEN_TENDERS_TOOL];
    if (pillar === XPostPillar.ContractAward)
      return [SEARCH_CONTRACT_AWARDS_TOOL];
    if (pillar === XPostPillar.MarketInsight) return [GET_MARKET_STATS_TOOL];

    return [];
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<XPostToolExecution> {
    if (name === 'search_open_tenders') return this.searchOpenTenders(args);
    if (name === 'search_contract_awards')
      return this.searchContractAwards(args);
    if (name === 'get_market_stats') return this.getMarketStats(args);

    return { result: { error: `Unknown tool "${name}"` }, records: [] };
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildTextFilter(query: unknown): Record<string, unknown> {
    const text = typeof query === 'string' ? query.trim() : '';

    if (!text) return {};

    const pattern = new RegExp(this.escapeRegExp(text), 'i');

    return { $or: [{ title: pattern }, { description: pattern }] };
  }

  private buildCountriesFilter(countries: unknown): Record<string, unknown> {
    const list = asStringArray(countries).map((code) => code.toUpperCase());

    return list.length ? { placeOfPerformanceCountries: { $in: list } } : {};
  }

  private buildCpvFilter(cpvCodePrefixes: unknown): Record<string, unknown> {
    const prefixes = asStringArray(cpvCodePrefixes);

    if (!prefixes.length) return {};

    return {
      cpvCodes: {
        $in: prefixes.map(
          (prefix) => new RegExp('^' + this.escapeRegExp(prefix)),
        ),
      },
    };
  }

  private async searchOpenTenders(
    args: Record<string, unknown>,
  ): Promise<XPostToolExecution> {
    const limit = clampInt(args.limit, 1, 10, 5);
    const sortBy = typeof args.sortBy === 'string' ? args.sortBy : 'value_desc';
    const sort: Record<string, 1 | -1> =
      sortBy === 'deadline_soonest'
        ? { submissionDeadline: 1 }
        : sortBy === 'newest'
          ? { publicationDate: -1 }
          : { estimatedValueEur: -1 };

    const filter: Record<string, unknown> = {
      submissionDeadline: { $gt: new Date() },
      ...this.buildTextFilter(args.query),
      ...this.buildCountriesFilter(args.countries),
      ...this.buildCpvFilter(args.cpvCodePrefixes),
    };

    const minValueEur = asOptionalNumber(args.minValueEur);
    const maxValueEur = asOptionalNumber(args.maxValueEur);

    if (minValueEur !== undefined || maxValueEur !== undefined) {
      filter.estimatedValueEur = {
        ...(minValueEur !== undefined ? { $gte: minValueEur } : {}),
        ...(maxValueEur !== undefined ? { $lte: maxValueEur } : {}),
      };
    }

    const tenders = await TenderModel.find(filter)
      .sort(sort)
      .limit(limit)
      .populate(tenderPopulateFields)
      .lean()
      .exec();

    const items = tenders.map((tender) => {
      const lots = tender.lots ?? [];
      const isDps = lots.some((lot) => lot.isDps);
      const isFrameworkAgreement = lots.some((lot) => lot.isFrameworkAgreement);

      return {
        id: tender.id,
        title: tender.title ?? tender.titleProc ?? 'Untitled tender',
        buyerNames: (tender.leadBuyers ?? []).map(extractName),
        countries: tender.placeOfPerformanceCountries ?? [],
        cpvCodes: tender.cpvCodes ?? [],
        estimatedValueEur: tender.estimatedValueEur ?? null,
        submissionDeadline: tender.submissionDeadline ?? null,
        isDps,
        isFrameworkAgreement,
        url: `${TENDERWIZE_ORIGIN}/en/tenders/${encodeURIComponent(tender.id)}`,
      };
    });

    const records = items.map((item) => ({
      id: item.id,
      summary: `Tender ${item.id}: "${item.title}" — buyer ${item.buyerNames.join(', ') || 'unknown'}, ${formatEurAmount(item.estimatedValueEur)}${item.isDps ? ' (dynamic purchasing system — this value is a ceiling over its lifetime, not a single purchase)' : item.isFrameworkAgreement ? ' (framework agreement — this value is a ceiling over its lifetime, not a single purchase)' : ''}, deadline ${formatDate(item.submissionDeadline)}. ${item.url}`,
    }));

    return { result: { items }, records };
  }

  private async searchContractAwards(
    args: Record<string, unknown>,
  ): Promise<XPostToolExecution> {
    const limit = clampInt(args.limit, 1, 10, 5);
    const sortBy = typeof args.sortBy === 'string' ? args.sortBy : 'value_desc';
    const sort: Record<string, 1 | -1> =
      sortBy === 'newest' ? { publicationDate: -1 } : { awardValueEur: -1 };

    const awardedWithinDays = clampInt(args.awardedWithinDays, 1, 3650, 365);
    const cutoff = new Date(Date.now() - awardedWithinDays * DAY_MS);

    const filter: Record<string, unknown> = {
      publicationDate: { $gte: cutoff },
      ...this.buildTextFilter(args.query),
      ...this.buildCountriesFilter(args.countries),
      ...this.buildCpvFilter(args.cpvCodePrefixes),
    };

    const minAwardValueEur = asOptionalNumber(args.minAwardValueEur);
    const maxAwardValueEur = asOptionalNumber(args.maxAwardValueEur);

    if (minAwardValueEur !== undefined || maxAwardValueEur !== undefined) {
      filter.awardValueEur = {
        ...(minAwardValueEur !== undefined ? { $gte: minAwardValueEur } : {}),
        ...(maxAwardValueEur !== undefined ? { $lte: maxAwardValueEur } : {}),
      };
    }

    const awards = await AwardTenderModel.find(filter)
      .sort(sort)
      .limit(limit)
      .populate(awardTenderPopulateFields)
      .lean()
      .exec();

    const items = awards.map((award) => {
      const lots = award.lots ?? [];
      const isDps = lots.some((lot) => lot.isDps);
      const isFrameworkAgreement = lots.some((lot) => lot.isFrameworkAgreement);

      return {
        id: award.id,
        title: award.title ?? award.titleProc ?? 'Untitled award',
        buyerNames: (award.leadBuyers ?? []).map(extractName),
        winnerNames: (award.winners ?? []).map(extractName),
        countries: award.placeOfPerformanceCountries ?? [],
        cpvCodes: award.cpvCodes ?? [],
        awardValueEur: award.awardValueEur ?? null,
        awardDate: award.publicationDate ?? null,
        isDps,
        isFrameworkAgreement,
      };
    });

    const records = items.map((item) => ({
      id: item.id,
      summary: `Award ${item.id}: "${item.title}" — buyer ${item.buyerNames.join(', ') || 'unknown'} awarded to ${item.winnerNames.join(', ') || 'unknown'}, ${formatEurAmount(item.awardValueEur)}${item.isDps ? ' (dynamic purchasing system — this is a ceiling over the mechanism\'s lifetime, not a lump sum paid to the winner)' : item.isFrameworkAgreement ? ' (framework agreement — this is a ceiling over the agreement\'s lifetime, not a lump sum paid to the winner)' : ''}, ${formatDate(item.awardDate)}.`,
    }));

    return { result: { items }, records };
  }

  private async getMarketStats(
    args: Record<string, unknown>,
  ): Promise<XPostToolExecution> {
    const metric =
      typeof args.metric === 'string' ? args.metric : 'tenders_published';
    const periodDays = clampInt(args.periodDays, 7, 365, 90);
    const compare = args.compareToPreviousPeriod !== false;

    const now = new Date();
    const periodStart = new Date(now.getTime() - periodDays * DAY_MS);
    const prevStart = new Date(periodStart.getTime() - periodDays * DAY_MS);

    const isTenderMetric =
      metric === 'tenders_published' || metric === 'tenders_value_sum_eur';
    const model = (isTenderMetric
      ? TenderModel
      : AwardTenderModel) as unknown as Model<Record<string, unknown>>;
    const valueField =
      metric === 'tenders_value_sum_eur'
        ? 'estimatedValueEur'
        : metric === 'awards_value_sum_eur'
          ? 'awardValueEur'
          : null;

    const baseFilter: Record<string, unknown> = {
      ...this.buildTextFilter(args.query),
      ...this.buildCountriesFilter(args.countries),
      ...this.buildCpvFilter(args.cpvCodePrefixes),
    };

    const computeForWindow = async (from: Date, to: Date): Promise<number> => {
      const filter = {
        ...baseFilter,
        publicationDate: { $gte: from, $lt: to },
      };

      if (!valueField) {
        return model.countDocuments(filter).exec();
      }

      const aggregate = await model
        .aggregate([
          { $match: filter },
          { $group: { _id: null, total: { $sum: `$${valueField}` } } },
        ])
        .exec();

      return (aggregate[0] as { total?: number } | undefined)?.total ?? 0;
    };

    const currentValue = await computeForWindow(periodStart, now);
    const previousValue = compare
      ? await computeForWindow(prevStart, periodStart)
      : null;
    const changePercent =
      previousValue !== null && previousValue > 0
        ? Math.round(((currentValue - previousValue) / previousValue) * 1000) /
          10
        : null;

    const result = {
      metric,
      periodDays,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      value: Math.round(currentValue * 100) / 100,
      previousValue:
        previousValue !== null ? Math.round(previousValue * 100) / 100 : null,
      changePercent,
    };

    return { result, records: [] };
  }

  /**
   * Finds recent, single-identifiable-winner awards and returns the
   * distinct winners (most recent award first), as candidates for a
   * Contract Award "Company Story". This is just a name list — cooldown
   * filtering and the actual pattern detection (detectCompanyStoryPattern)
   * happen in XPostService, which calls buildCompanyStoryFacts for each
   * candidate in order until one has a confirmed pattern.
   */
  async findCompanyStoryCandidates(
    limit: number,
  ): Promise<CompanyStoryCandidate[]> {
    const cutoff = new Date(Date.now() - 365 * DAY_MS);

    const recentAwards = await AwardTenderModel.find({
      publicationDate: { $gte: cutoff },
      winners: { $exists: true, $ne: [] },
    })
      .sort({ publicationDate: -1 })
      .limit(Math.max(300, limit * 15))
      .populate([{ path: 'winners', select: 'name' }])
      .select('winners')
      .lean()
      .exec();

    const candidates = new Map<string, CompanyStoryCandidate>();

    for (const award of recentAwards) {
      const winner = (award.winners ?? [])[0];

      if (!winner || typeof winner !== 'object') continue;

      const winnerId = String((winner as { _id?: unknown })._id ?? '');
      const winnerName = extractName(winner);

      if (!winnerId || winnerName === 'unknown') continue;
      if (candidates.has(winnerId)) continue;

      candidates.set(winnerId, { winnerId, winnerName });

      if (candidates.size >= limit) break;
    }

    return Array.from(candidates.values());
  }

  /**
   * Computes the real, verifiable facts of a supplier's award history from
   * our data — the AI never queries or aggregates this itself (see
   * X_POSTS_GUIDELINES.md "Company Story"). Returns null when there's fewer
   * than 2 awards, since a single award isn't a "history".
   */
  async buildCompanyStoryFacts(
    winnerId: string,
    winnerName: string,
  ): Promise<CompanyStoryFacts | null> {
    const awards = await AwardTenderModel.find({ winners: winnerId })
      .sort({ publicationDate: -1 })
      .limit(200)
      .populate([{ path: 'leadBuyers', select: 'name' }])
      .select(
        'id title titleProc leadBuyers awardValueEur publicationDate placeOfPerformanceCountries cpvCodes',
      )
      .lean()
      .exec();

    if (awards.length < 2) return null;

    const refs: CompanyStoryAwardRef[] = awards.map((award) => ({
      id: award.id,
      title: award.title ?? award.titleProc ?? 'Untitled award',
      buyerNames: (award.leadBuyers ?? []).map(extractName),
      countries: award.placeOfPerformanceCountries ?? [],
      cpvCodes: award.cpvCodes ?? [],
      valueEur: asOptionalNumber(award.awardValueEur) ?? null,
      date:
        formatDate(award.publicationDate) === 'unknown date'
          ? null
          : formatDate(award.publicationDate),
    }));

    const datedRefs = refs.filter(
      (ref): ref is CompanyStoryAwardRef & { date: string } =>
        ref.date !== null,
    );
    const valuedRefs = refs.filter(
      (ref): ref is CompanyStoryAwardRef & { valueEur: number } =>
        typeof ref.valueEur === 'number',
    );

    const latestAward =
      datedRefs.length > 0
        ? datedRefs.reduce((a, b) => (a.date > b.date ? a : b))
        : (refs[0] ?? null);
    const firstAward =
      datedRefs.length > 0
        ? datedRefs.reduce((a, b) => (a.date < b.date ? a : b))
        : null;
    const largestAward =
      valuedRefs.length > 0
        ? valuedRefs.reduce((a, b) => (a.valueEur > b.valueEur ? a : b))
        : null;
    const knownTotalValueEur =
      valuedRefs.length > 0
        ? valuedRefs.reduce((sum, ref) => sum + ref.valueEur, 0)
        : null;

    const buyerNames = Array.from(
      new Set(refs.flatMap((ref) => ref.buyerNames)),
    ).filter((name) => name !== 'unknown');
    const countries = Array.from(
      new Set(awards.flatMap((award) => award.placeOfPerformanceCountries ?? [])),
    );

    const spanDays =
      firstAward?.date &&
      latestAward?.date &&
      firstAward.date !== latestAward.date
        ? Math.round(
            (new Date(latestAward.date).getTime() -
              new Date(firstAward.date).getTime()) /
              DAY_MS,
          )
        : null;

    const buyerCounts = new Map<string, number>();

    for (const ref of refs) {
      for (const name of ref.buyerNames) {
        if (name === 'unknown') continue;
        buyerCounts.set(name, (buyerCounts.get(name) ?? 0) + 1);
      }
    }

    let topRepeatBuyer: { name: string; awardCount: number } | null = null;

    for (const [name, count] of buyerCounts) {
      if (count >= 2 && (!topRepeatBuyer || count > topRepeatBuyer.awardCount)) {
        topRepeatBuyer = { name, awardCount: count };
      }
    }

    const chronological = datedRefs
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const TIMELINE_EDGE_SIZE = 15;
    const awardTimeline =
      chronological.length <= TIMELINE_EDGE_SIZE * 2
        ? chronological
        : [
            ...chronological.slice(0, TIMELINE_EDGE_SIZE),
            ...chronological.slice(-TIMELINE_EDGE_SIZE),
          ];
    const awardTimelineTruncatedCount =
      chronological.length - awardTimeline.length;

    const detectedStory = detectCompanyStoryPattern(refs, {
      awardCount: awards.length,
      latestAwardId: latestAward?.id ?? null,
    });

    return {
      winnerId,
      winnerName,
      awardCount: awards.length,
      knownTotalValueEur,
      firstAwardDate: firstAward?.date ?? null,
      latestAwardDate: latestAward?.date ?? null,
      firstAward,
      latestAward,
      largestAward,
      spanDays,
      buyerNames,
      topRepeatBuyer,
      countries,
      awardTimeline,
      awardTimelineTruncatedCount,
      detectedStory,
    };
  }

  /**
   * Median estimated value among currently-open tenders, grouped by CPV
   * division (first 2 digits of the leading CPV code) — the real baseline
   * `detectExceptionalValue` compares a candidate's value against, instead
   * of "biggest number we found". One aggregation for the whole generation,
   * not one query per candidate.
   */
  async computeOpenTenderCategoryBaselines(): Promise<
    Map<string, { median: number; count: number }>
  > {
    const rows = await TenderModel.aggregate<{
      division: string | null;
      estimatedValueEur: number;
    }>([
      {
        $match: {
          submissionDeadline: { $gt: new Date() },
          estimatedValueEur: { $type: 'number', $gt: 0 },
          cpvCodes: { $exists: true, $ne: [] },
        },
      },
      {
        $project: {
          division: {
            $substrBytes: [{ $arrayElemAt: ['$cpvCodes', 0] }, 0, 2],
          },
          estimatedValueEur: 1,
        },
      },
    ]).exec();

    const byDivision = new Map<string, number[]>();

    for (const row of rows) {
      if (!row.division) continue;

      const values = byDivision.get(row.division) ?? [];

      values.push(row.estimatedValueEur);
      byDivision.set(row.division, values);
    }

    const baselines = new Map<string, { median: number; count: number }>();

    for (const [division, values] of byDivision) {
      baselines.set(division, { median: median(values), count: values.length });
    }

    return baselines;
  }

  /**
   * Candidate pool for Interesting Tender pattern detection: the highest-
   * value open tenders (where exceptional_value/long_term_mechanism/
   * complex_structure are likely to show up) unioned with the
   * soonest-closing ones above a minimum value (where short_deadline shows
   * up) — sorting by value alone would starve that pattern of candidates.
   */
  async findInterestingTenderCandidates(limit: number): Promise<string[]> {
    const now = new Date();
    const half = Math.ceil(limit / 2);

    const [byValue, byDeadline] = await Promise.all([
      TenderModel.find({ submissionDeadline: { $gt: now } })
        .sort({ estimatedValueEur: -1 })
        .limit(half)
        .select('id')
        .lean()
        .exec(),
      TenderModel.find({
        submissionDeadline: { $gt: now },
        estimatedValueEur: { $gte: 500_000 },
      })
        .sort({ submissionDeadline: 1 })
        .limit(half)
        .select('id')
        .lean()
        .exec(),
    ]);

    const ids = new Set<string>();

    for (const tender of [...byValue, ...byDeadline]) {
      if (tender.id) ids.add(tender.id);
    }

    return Array.from(ids).slice(0, limit);
  }

  /**
   * Computes the real, verifiable facts of one open tender candidate,
   * including the baseline comparisons the detectors need — the AI never
   * queries or aggregates this itself (see X_POSTS_GUIDELINES.md
   * "Interesting Tender pattern detection").
   */
  async buildInterestingTenderFacts(
    tenderId: string,
    categoryBaselines: Map<string, { median: number; count: number }>,
  ): Promise<(TenderCandidateFacts & { detectedStory: DetectedInterestingTender | null }) | null> {
    const tender = await TenderModel.findOne({ id: tenderId })
      .populate(tenderPopulateFields)
      .lean()
      .exec();

    if (!tender) return null;

    const buyerNames = (tender.leadBuyers ?? []).map(extractName);
    const buyerTendersCount =
      (tender.leadBuyers ?? [])
        .map(extractBuyerTendersCount)
        .find((count): count is number => typeof count === 'number') ?? null;
    const cpvCodes = tender.cpvCodes ?? [];
    const cpvDivision = cpvCodes[0]?.slice(0, 2) ?? null;
    const baseline = cpvDivision ? categoryBaselines.get(cpvDivision) : undefined;
    const lots = tender.lots ?? [];
    const isFrameworkAgreement = lots.some((lot) => lot.isFrameworkAgreement);
    const isDps = lots.some((lot) => lot.isDps);
    const durationMonths =
      tender.plannedStartDate && tender.plannedEndDate
        ? Math.round(
            (new Date(tender.plannedEndDate).getTime() -
              new Date(tender.plannedStartDate).getTime()) /
              (30 * DAY_MS),
          )
        : null;

    const historicalCategoryCount = cpvCodes[0]
      ? await TenderModel.countDocuments({ cpvCodes: cpvCodes[0] }).exec()
      : null;

    const facts: TenderCandidateFacts = {
      id: tender.id,
      title: tender.title ?? tender.titleProc ?? 'Untitled tender',
      buyerNames,
      buyerTendersCount,
      countries: tender.placeOfPerformanceCountries ?? [],
      cpvCodes,
      estimatedValueEur: tender.estimatedValueEur ?? null,
      submissionDeadline:
        formatDate(tender.submissionDeadline) === 'unknown date'
          ? null
          : formatDate(tender.submissionDeadline),
      isFrameworkAgreement,
      isDps,
      lotsCount: lots.length,
      durationMonths,
      categoryMedianValueEur: baseline?.median ?? null,
      categorySampleSize: baseline?.count ?? 0,
      historicalCategoryCount,
      url: `${TENDERWIZE_ORIGIN}/en/tenders/${encodeURIComponent(tender.id)}`,
    };

    return { ...facts, detectedStory: detectInterestingTenderPattern(facts) };
  }

  /**
   * Candidate pool for Market Insight pattern detection: "Overall" plus the
   * top 10 most active countries and top 10 most active CPV divisions
   * (by recent volume), each with a current-vs-previous period comparison —
   * the real baselines market-insight-detector.ts scores against, instead
   * of letting the model wander across metrics/countries itself.
   */
  async findMarketInsightSlices(periodDays = 90): Promise<MarketSliceStats[]> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - periodDays * DAY_MS);
    const prevStart = new Date(periodStart.getTime() - periodDays * DAY_MS);

    const [topCountries, topDivisions] = await Promise.all([
      TenderModel.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            publicationDate: { $gte: prevStart },
            placeOfPerformanceCountries: { $exists: true, $ne: [] },
          },
        },
        { $unwind: '$placeOfPerformanceCountries' },
        { $group: { _id: '$placeOfPerformanceCountries', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).exec(),
      TenderModel.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            publicationDate: { $gte: prevStart },
            cpvCodes: { $exists: true, $ne: [] },
          },
        },
        {
          $project: {
            division: { $substrBytes: [{ $arrayElemAt: ['$cpvCodes', 0] }, 0, 2] },
          },
        },
        { $group: { _id: '$division', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).exec(),
    ]);

    interface Scope {
      label: string;
      countries: string[] | null;
      cpvDivision: string | null;
    }

    const scopes: Scope[] = [
      { label: 'Overall', countries: null, cpvDivision: null },
      ...topCountries
        .filter((c) => c._id)
        .map((c) => ({ label: c._id, countries: [c._id], cpvDivision: null })),
      ...topDivisions
        .filter((d) => d._id)
        .map((d) => ({
          label: `CPV ${d._id}`,
          countries: null,
          cpvDivision: d._id,
        })),
    ];

    const computeWindow = async (
      scope: Scope,
      from: Date,
      to: Date,
    ): Promise<{ count: number; totalValue: number }> => {
      const filter: Record<string, unknown> = {
        publicationDate: { $gte: from, $lt: to },
      };

      if (scope.countries) {
        filter.placeOfPerformanceCountries = { $in: scope.countries };
      }

      if (scope.cpvDivision) {
        filter.cpvCodes = {
          $in: [new RegExp('^' + this.escapeRegExp(scope.cpvDivision))],
        };
      }

      const rows = await TenderModel.aggregate<{
        count: number;
        totalValue: number;
      }>([
        { $match: filter },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalValue: { $sum: { $ifNull: ['$estimatedValueEur', 0] } },
          },
        },
      ]).exec();

      return rows[0] ?? { count: 0, totalValue: 0 };
    };

    const slices: MarketSliceStats[] = [];

    for (const scope of scopes) {
      const [current, previous] = await Promise.all([
        computeWindow(scope, periodStart, now),
        computeWindow(scope, prevStart, periodStart),
      ]);

      slices.push({
        label: scope.label,
        countries: scope.countries,
        cpvDivision: scope.cpvDivision,
        periodDays,
        currentCount: current.count,
        previousCount: previous.count,
        currentValueEur: current.totalValue > 0 ? current.totalValue : null,
        previousValueEur: previous.totalValue > 0 ? previous.totalValue : null,
      });
    }

    return slices;
  }
}
