/**
 * Deterministic Market Insight pattern detection — same detect-first
 * discipline as company-story-detector.ts and
 * interesting-tender-detector.ts.
 *
 * The old approach let the model "explore the data yourself" across
 * metrics/countries/categories with several tool calls and report
 * "whichever trend is the most interesting" — the exact same failure mode
 * as sorting tenders by value_desc: the model is free to talk itself into
 * a two-point comparison being a trend (e.g. "tenders went from 2 to 3 in
 * Malta — a 50% surge!"). Every candidate here is instead scored from a
 * real minimum sample size and a real percentage-change threshold before
 * the model ever sees it.
 */

export type MarketInsightPatternType = 'surge' | 'decline' | 'new_activity';

export interface DetectedMarketInsight {
  type: MarketInsightPatternType;
  /** 0-1 confidence this is a genuine, tellable trend — see MARKET_INSIGHT_REQUIRED_SCORE. */
  score: number;
  summary: string;
  evidence: Record<string, unknown>;
}

export interface MarketSliceStats {
  /** Human-readable scope, e.g. "Overall", "Germany", "CPV 45". */
  label: string;
  countries: string[] | null;
  cpvDivision: string | null;
  periodDays: number;
  currentCount: number;
  previousCount: number;
  currentValueEur: number | null;
  previousValueEur: number | null;
}

export const MARKET_INSIGHT_REQUIRED_SCORE = 0.6;
/** Minimum tenders in the current period for a slice to be considered at all — never trend-call a handful of records. */
const MIN_SAMPLE_SIZE = 5;
/** Minimum |change%| for surge/decline once both periods have a real sample. */
const MIN_CHANGE_PERCENT = 40;

function euro(amount: number): string {
  if (amount >= 1_000_000_000) return `€${(amount / 1_000_000_000).toFixed(1)}bn`;
  if (amount >= 1_000_000) return `€${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `€${(amount / 1_000).toFixed(0)}k`;

  return `€${amount.toLocaleString('en-US')}`;
}

function detectSlice(slice: MarketSliceStats): DetectedMarketInsight | null {
  if (slice.currentCount < MIN_SAMPLE_SIZE) return null;

  const valueNote =
    slice.currentValueEur !== null
      ? ` (a combined ${euro(slice.currentValueEur)} in disclosed value)`
      : '';

  // NEW_ACTIVITY: the prior period had essentially nothing — this is a
  // market that has just started showing up, not a percentage swing.
  if (slice.previousCount <= 1) {
    const score = Math.min(1, 0.5 + Math.min(slice.currentCount, 50) * 0.01);

    return {
      type: 'new_activity',
      score,
      summary: `${slice.label}: ${slice.currentCount} tenders published in the last ${slice.periodDays} days${valueNote}, versus almost none (${slice.previousCount}) in the prior ${slice.periodDays}-day period.`,
      evidence: { ...slice, changePercent: null },
    };
  }

  const changePercent =
    ((slice.currentCount - slice.previousCount) / slice.previousCount) * 100;

  if (Math.abs(changePercent) < MIN_CHANGE_PERCENT) return null;

  const score = Math.min(1, 0.5 + Math.min(Math.abs(changePercent), 300) * 0.0017);
  const roundedChange = Math.round(changePercent * 10) / 10;

  return {
    type: changePercent > 0 ? 'surge' : 'decline',
    score,
    summary: `${slice.label}: ${slice.currentCount} tenders in the last ${slice.periodDays} days vs ${slice.previousCount} in the prior period (${roundedChange > 0 ? '+' : ''}${roundedChange}%)${valueNote}.`,
    evidence: { ...slice, changePercent: roundedChange },
  };
}

/** Runs detection over every candidate slice and returns the single best-scoring trend, or null if nothing clears MARKET_INSIGHT_REQUIRED_SCORE. */
export function detectBestMarketInsight(
  slices: MarketSliceStats[],
): DetectedMarketInsight | null {
  const candidates = slices
    .map(detectSlice)
    .filter((c): c is DetectedMarketInsight => c !== null);

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));

  return best.score >= MARKET_INSIGHT_REQUIRED_SCORE ? best : null;
}
