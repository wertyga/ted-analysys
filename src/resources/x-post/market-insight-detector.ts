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

export type MarketInsightPatternType =
  | 'surge'
  | 'decline'
  | 'new_activity'
  | 'value_surge'
  | 'value_decline'
  | 'concentration';

export interface DetectedMarketInsight {
  type: MarketInsightPatternType;
  /** 0-1 confidence this is a genuine, tellable trend — see MARKET_INSIGHT_REQUIRED_SCORE. */
  score: number;
  summary: string;
  evidence: Record<string, unknown>;
  /**
   * Stable identity of the underlying fact (scope + metric + period +
   * direction), independent of the exact numbers or however the LLM ends up
   * phrasing it — e.g. "market_insight:overall:tender_count:90d:surge". Used
   * to enforce a cooldown so the same fact isn't re-selected and merely
   * reworded across generations; see MARKET_INSIGHT_COOLDOWN_DAYS in
   * x-post.service.ts.
   */
  fingerprint: string;
}

export interface MarketSliceStats {
  /** Human-readable scope, e.g. "Overall", "Germany", "CPV 45". */
  label: string;
  /** Stable scope identity for fingerprinting, e.g. "overall", "country:DE", "cpv:45" — unlike `label`, never changes shape based on display formatting. */
  scopeKey: string;
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
/** Minimum current-period disclosed value for a value_surge/value_decline candidate — never call a swing between two small sums a trend. */
const MIN_VALUE_EUR = 1_000_000;
/** How many top scopes to sum for a concentration candidate (e.g. top 3 countries). */
const CONCENTRATION_TOP_N = 3;
/** Minimum share the top scopes must hold of the overall total for concentration to be worth mentioning. */
const MIN_CONCENTRATION_SHARE = 55;
/**
 * Minimum distinct scopes (countries/CPV divisions) that must actually have
 * activity for a concentration reading to be informative rather than
 * trivial — e.g. "the only 2 countries we saw account for 100%" isn't a
 * finding, it's just a small sample. Mirrors the "pattern confidence ≠
 * storyworthiness" discipline from company-story-detector.ts's Specialization
 * pattern.
 */
const MIN_CONCENTRATION_DISTINCT_SCOPES = 5;
/** Minimum overall current-period count for concentration to be considered at all. */
const MIN_CONCENTRATION_TOTAL = 30;

function euro(amount: number): string {
  if (amount >= 1_000_000_000)
    return `€${(amount / 1_000_000_000).toFixed(1)}bn`;
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
    const type: MarketInsightPatternType = 'new_activity';

    return {
      type,
      score,
      summary: `${slice.label}: ${slice.currentCount} tenders published in the last ${slice.periodDays} days${valueNote}, versus almost none (${slice.previousCount}) in the prior ${slice.periodDays}-day period.`,
      evidence: { ...slice, changePercent: null },
      fingerprint: buildFingerprint(slice, 'tender_count', type),
    };
  }

  const changePercent =
    ((slice.currentCount - slice.previousCount) / slice.previousCount) * 100;

  if (Math.abs(changePercent) < MIN_CHANGE_PERCENT) return null;

  const score = Math.min(
    1,
    0.5 + Math.min(Math.abs(changePercent), 300) * 0.0017,
  );
  const roundedChange = Math.round(changePercent * 10) / 10;
  const type: MarketInsightPatternType =
    changePercent > 0 ? 'surge' : 'decline';

  return {
    type,
    score,
    summary: `${slice.label}: ${slice.currentCount} tenders in the last ${slice.periodDays} days vs ${slice.previousCount} in the prior period (${roundedChange > 0 ? '+' : ''}${roundedChange}%)${valueNote}.`,
    evidence: { ...slice, changePercent: roundedChange },
    fingerprint: buildFingerprint(slice, 'tender_count', type),
  };
}

/**
 * Value-based counterpart to detectSlice: same scopes (Overall, each
 * country, each CPV division, each top buyer), but trending disclosed
 * `estimatedValueEur` instead of raw tender counts. Kept as a separate pass
 * rather than folded into detectSlice because it has its own minimum
 * evidence bar (MIN_VALUE_EUR) — a scope can have a real count-based surge
 * with a tiny or absent disclosed value, and vice versa, so each metric must
 * qualify independently rather than inheriting the other's sample-size gate.
 */
function detectValueSlice(
  slice: MarketSliceStats,
): DetectedMarketInsight | null {
  if (slice.currentCount < MIN_SAMPLE_SIZE) return null;
  if (slice.currentValueEur === null || slice.previousValueEur === null) {
    return null;
  }

  if (slice.currentValueEur < MIN_VALUE_EUR) return null;
  // A previous-period value of 0 makes percentage change undefined/infinite
  // — treat as not comparable rather than manufacturing a "new activity by
  // value" pattern (unlike tender_count, a 0 disclosed value more often
  // means "not disclosed" than "no market", so it isn't a genuine baseline).
  if (slice.previousValueEur <= 0) return null;

  const changePercent =
    ((slice.currentValueEur - slice.previousValueEur) /
      slice.previousValueEur) *
    100;

  if (Math.abs(changePercent) < MIN_CHANGE_PERCENT) return null;

  const score = Math.min(
    1,
    0.5 + Math.min(Math.abs(changePercent), 300) * 0.0017,
  );
  const roundedChange = Math.round(changePercent * 10) / 10;
  const type: MarketInsightPatternType =
    changePercent > 0 ? 'value_surge' : 'value_decline';

  return {
    type,
    score,
    summary: `${slice.label}: disclosed tender value over the last ${slice.periodDays} days is ${euro(slice.currentValueEur)}, vs ${euro(slice.previousValueEur)} in the prior period (${roundedChange > 0 ? '+' : ''}${roundedChange}%), across ${slice.currentCount} tenders.`,
    evidence: { ...slice, changePercent: roundedChange },
    fingerprint: buildFingerprint(slice, 'value_eur', type),
  };
}

/**
 * Concentration: what share of activity in a dimension (countries or CPV
 * divisions) is held by the top CONCENTRATION_TOP_N scopes, computed
 * straight from the current-period counts already gathered for the
 * surge/decline slices — no extra query needed. Unlike surge/decline this
 * isn't a period-over-period comparison, it's a snapshot, so it's gated the
 * way Company Story's Specialization pattern is: a high share only counts if
 * it holds up across enough distinct scopes to be informative rather than an
 * artifact of a small/narrow sample (see MIN_CONCENTRATION_DISTINCT_SCOPES).
 */
function detectConcentration(
  scopedSlices: MarketSliceStats[],
  overall: MarketSliceStats | undefined,
  dimension: 'country' | 'cpv',
): DetectedMarketInsight | null {
  if (!overall || overall.currentCount < MIN_CONCENTRATION_TOTAL) return null;

  const withActivity = scopedSlices.filter((s) => s.currentCount > 0);

  if (withActivity.length < MIN_CONCENTRATION_DISTINCT_SCOPES) return null;

  const top = [...withActivity]
    .sort((a, b) => b.currentCount - a.currentCount)
    .slice(0, CONCENTRATION_TOP_N);
  const topSum = top.reduce((sum, s) => sum + s.currentCount, 0);
  const share = (topSum / overall.currentCount) * 100;

  if (share < MIN_CONCENTRATION_SHARE) return null;

  const score = Math.min(
    1,
    0.5 + Math.min(share - MIN_CONCENTRATION_SHARE, 40) * 0.0125,
  );
  const roundedShare = Math.round(share * 10) / 10;
  const dimensionLabel =
    dimension === 'country' ? 'countries' : 'CPV categories';
  const names = top.map((s) => s.label).join(', ');

  return {
    type: 'concentration',
    score,
    summary: `${names} together account for ${roundedShare}% of the ${overall.currentCount} tenders Tenderwize tracked in the last ${overall.periodDays} days (out of ${withActivity.length} ${dimensionLabel} seen).`,
    evidence: {
      dimension,
      periodDays: overall.periodDays,
      totalCurrentCount: overall.currentCount,
      distinctScopes: withActivity.length,
      topScopes: top.map((s) => ({
        label: s.label,
        scopeKey: s.scopeKey,
        currentCount: s.currentCount,
      })),
      sharePercent: roundedShare,
    },
    fingerprint: `market_insight:concentration:${dimension}:${overall.periodDays}d`,
  };
}

/**
 * Fingerprint identifies *which fact* this is (scope + metric + period +
 * direction) — not the specific numbers, so a cooldown check can recognize
 * "we already told the Overall 90-day surge story" even if the exact count
 * shifted slightly between generations.
 */
function buildFingerprint(
  slice: MarketSliceStats,
  metric: 'tender_count' | 'value_eur',
  type: MarketInsightPatternType,
): string {
  return `market_insight:${slice.scopeKey}:${metric}:${slice.periodDays}d:${type}`;
}

/**
 * Runs every detection angle (count surge/decline/new-activity, value
 * surge/decline, and geographic/category concentration) over the candidate
 * slices and returns the single best-scoring trend, or null if nothing
 * clears MARKET_INSIGHT_REQUIRED_SCORE. `slices` is expected to include one
 * "overall" scope (scopeKey === 'overall') plus any mix of country:/cpv:/
 * buyer: scopes — see XPostDataService.findMarketInsightSlices.
 *
 * `excludeFingerprints` drops any candidate whose fact was already told
 * recently (see x-post.service.ts's cooldown) *before* picking the best
 * score — so a still-dominant but already-used trend doesn't keep winning
 * and getting reworded; the next-best genuinely different fact is surfaced
 * instead.
 */
export function detectBestMarketInsight(
  slices: MarketSliceStats[],
  excludeFingerprints?: ReadonlySet<string>,
): DetectedMarketInsight | null {
  const overall = slices.find((s) => s.scopeKey === 'overall');
  const countryScopes = slices.filter((s) => s.scopeKey.startsWith('country:'));
  const cpvScopes = slices.filter((s) => s.scopeKey.startsWith('cpv:'));

  const candidates = [
    ...slices.map(detectSlice),
    ...slices.map(detectValueSlice),
    detectConcentration(countryScopes, overall, 'country'),
    detectConcentration(cpvScopes, overall, 'cpv'),
  ]
    .filter((c): c is DetectedMarketInsight => c !== null)
    .filter((c) => !excludeFingerprints?.has(c.fingerprint));

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));

  return best.score >= MARKET_INSIGHT_REQUIRED_SCORE ? best : null;
}
