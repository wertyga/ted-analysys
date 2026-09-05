import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { TenderModel } from '@/resources/tenders/schemas';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { tenderPopulateFields, awardTenderPopulateFields } from '@/utils';
import { XPostPillar } from './schemas/x-post.schema';

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
      "Search Tenderwize's real database of currently open public tenders (submission deadline in the future). Use this for the Interesting Tender pillar. Returned monetary amounts are always in EUR, already converted.",
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
      "Search Tenderwize's real database of completed contract awards (who bought, who won, how much). Use this for the Contract Award pillar. Returned monetary amounts are always in EUR, already converted.",
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

    const items = tenders.map((tender) => ({
      id: tender.id,
      title: tender.title ?? tender.titleProc ?? 'Untitled tender',
      buyerNames: (tender.leadBuyers ?? []).map(extractName),
      countries: tender.placeOfPerformanceCountries ?? [],
      cpvCodes: tender.cpvCodes ?? [],
      estimatedValueEur: tender.estimatedValueEur ?? null,
      submissionDeadline: tender.submissionDeadline ?? null,
      url: `${TENDERWIZE_ORIGIN}/en/tenders/${encodeURIComponent(tender.id)}`,
    }));

    const records = items.map((item) => ({
      id: item.id,
      summary: `Tender ${item.id}: "${item.title}" — buyer ${item.buyerNames.join(', ') || 'unknown'}, ${formatEurAmount(item.estimatedValueEur)}, deadline ${formatDate(item.submissionDeadline)}. ${item.url}`,
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

    const items = awards.map((award) => ({
      id: award.id,
      title: award.title ?? award.titleProc ?? 'Untitled award',
      buyerNames: (award.leadBuyers ?? []).map(extractName),
      winnerNames: (award.winners ?? []).map(extractName),
      countries: award.placeOfPerformanceCountries ?? [],
      cpvCodes: award.cpvCodes ?? [],
      awardValueEur: award.awardValueEur ?? null,
      awardDate: award.publicationDate ?? null,
    }));

    const records = items.map((item) => ({
      id: item.id,
      summary: `Award ${item.id}: "${item.title}" — buyer ${item.buyerNames.join(', ') || 'unknown'} awarded to ${item.winnerNames.join(', ') || 'unknown'}, ${formatEurAmount(item.awardValueEur)}, ${formatDate(item.awardDate)}.`,
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
}
