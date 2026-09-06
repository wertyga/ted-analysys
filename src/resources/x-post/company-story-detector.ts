import { CompanyStoryAwardRef } from './x-post-data.service';

/**
 * Deterministic Company Story pattern detection ("stage 1" of the
 * two-stage design: backend decides WHAT happened, the LLM only decides
 * HOW to tell it — see X_POSTS_GUIDELINES.md "Company Story"). Every
 * detector here is pure arithmetic over real award records; none of it
 * involves the LLM, so a candidate either has a confirmed pattern or it
 * doesn't — there is nothing for a model to "find" or talk itself into.
 *
 * A numerical contrast between exactly two data points (e.g. largest award
 * vs. latest award) is deliberately NOT a valid signal on its own anywhere
 * below — every detector requires either multiple periods/observations or a
 * comparison against a genuine baseline (a median, a repeat count, a round
 * threshold), per the "Meaningful Narrative Rule".
 */

export type CompanyStoryPatternType =
  | 'growth'
  | 'acceleration'
  | 'repeat_buyer'
  | 'buyer_expansion'
  | 'market_expansion'
  | 'exceptional_win'
  | 'specialization'
  | 'milestone';

export interface DetectedCompanyStory {
  type: CompanyStoryPatternType;
  /** 0-1 confidence that this is a genuine, tellable pattern — see COMPANY_STORY_REQUIRED_SCORE. */
  score: number;
  /** A plain-language, fully-verified description of the pattern, built only from the evidence below. */
  summary: string;
  /** Concrete supporting numbers/ids the LLM may cite verbatim; nothing outside this object may be stated as fact. */
  evidence: Record<string, unknown>;
}

/** A candidate must score at least this high (on any single pattern) to be told as a Company Story at all. */
export const COMPANY_STORY_REQUIRED_SCORE = 0.7;

type DatedRef = CompanyStoryAwardRef & { date: string };
type ValuedRef = CompanyStoryAwardRef & { valueEur: number };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function euro(amount: number): string {
  if (amount >= 1_000_000) return `€${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `€${(amount / 1_000).toFixed(0)}k`;

  return `€${amount.toLocaleString('en-US')}`;
}

function isDated(ref: CompanyStoryAwardRef): ref is DatedRef {
  return ref.date !== null;
}

function isValued(ref: CompanyStoryAwardRef): ref is ValuedRef {
  return typeof ref.valueEur === 'number';
}

/** GROWTH: requires >=3 distinct calendar years with awards, and a real (2x+), non-decreasing trend across all of them — never inferred from two individual awards. */
function detectGrowth(dated: DatedRef[]): DetectedCompanyStory | null {
  const byYear = new Map<string, { count: number; total: number }>();

  for (const ref of dated) {
    const year = ref.date.slice(0, 4);
    const bucket = byYear.get(year) ?? { count: 0, total: 0 };

    bucket.count += 1;
    if (typeof ref.valueEur === 'number') bucket.total += ref.valueEur;
    byYear.set(year, bucket);
  }

  const years = Array.from(byYear.keys()).sort();

  if (years.length < 3) return null;

  const counts = years.map((y) => byYear.get(y)!.count);
  const totals = years.map((y) => byYear.get(y)!.total);
  const countMonotonic = counts.every((c, i) => i === 0 || c >= counts[i - 1]);
  const totalMonotonic = totals.every((t, i) => i === 0 || t >= totals[i - 1]);
  const countRatio =
    counts[0] > 0 ? counts[counts.length - 1] / counts[0] : 0;
  const totalRatio =
    totals[0] > 0 ? totals[totals.length - 1] / totals[0] : 0;
  const countQualifies = countMonotonic && countRatio >= 2;
  const totalQualifies = totalMonotonic && totalRatio >= 2;

  if (!countQualifies && !totalQualifies) return null;

  const ratio = Math.max(countQualifies ? countRatio : 0, totalQualifies ? totalRatio : 0);
  const score = Math.min(
    1,
    0.55 + Math.min(ratio, 6) * 0.06 + (years.length - 3) * 0.03,
  );

  return {
    type: 'growth',
    score,
    summary: `Awards grew from ${counts[0]} in ${years[0]} to ${counts[counts.length - 1]} in ${years[years.length - 1]}${totals[0] > 0 ? `, disclosed value from ${euro(totals[0])} to ${euro(totals[totals.length - 1])}` : ''}.`,
    evidence: { years, countsByYear: counts, totalsByYear: totals },
  };
}

/** ACCELERATION: compares award frequency in the first vs. second half of the supplier's own time span — needs >=5 dated awards and a >=2x, >=3-award jump, not two isolated wins. */
function detectAcceleration(dated: DatedRef[]): DetectedCompanyStory | null {
  if (dated.length < 5) return null;

  const sorted = [...dated].sort((a, b) => (a.date < b.date ? -1 : 1));
  const firstTime = new Date(sorted[0].date).getTime();
  const lastTime = new Date(sorted[sorted.length - 1].date).getTime();

  if (lastTime <= firstTime) return null;

  const midpoint = firstTime + (lastTime - firstTime) / 2;
  const firstHalf = sorted.filter(
    (r) => new Date(r.date).getTime() < midpoint,
  );
  const secondHalf = sorted.filter(
    (r) => new Date(r.date).getTime() >= midpoint,
  );

  if (firstHalf.length === 0) return null;

  const ratio = secondHalf.length / firstHalf.length;

  if (ratio < 2 || secondHalf.length - firstHalf.length < 3) return null;

  const score = Math.min(1, 0.5 + Math.min(ratio, 6) * 0.08);

  return {
    type: 'acceleration',
    score,
    summary: `${firstHalf.length} awards in the first half of its history in our data (${sorted[0].date} onward) vs. ${secondHalf.length} in the second half (through ${sorted[sorted.length - 1].date}).`,
    evidence: {
      firstHalfCount: firstHalf.length,
      secondHalfCount: secondHalf.length,
      periodStart: sorted[0].date,
      periodEnd: sorted[sorted.length - 1].date,
    },
  };
}

/** REPEAT_BUYER: requires the same buyer to appear on >=3 awards — "two awards, same buyer" is not enough evidence of a relationship. */
function detectRepeatBuyer(refs: CompanyStoryAwardRef[]): DetectedCompanyStory | null {
  const counts = new Map<string, { count: number; ids: string[]; years: Set<string> }>();

  for (const ref of refs) {
    for (const name of ref.buyerNames) {
      if (name === 'unknown') continue;

      const bucket = counts.get(name) ?? { count: 0, ids: [], years: new Set<string>() };

      bucket.count += 1;
      bucket.ids.push(ref.id);
      if (ref.date) bucket.years.add(ref.date.slice(0, 4));
      counts.set(name, bucket);
    }
  }

  let top: { name: string; count: number; ids: string[]; years: Set<string> } | null = null;

  for (const [name, bucket] of counts) {
    if (!top || bucket.count > top.count) top = { name, ...bucket };
  }

  if (!top || top.count < 3) return null;

  const ratio = top.count / refs.length;
  const score = Math.min(1, 0.15 * top.count + 0.3 * ratio);
  const years = Array.from(top.years).sort();

  return {
    type: 'repeat_buyer',
    score,
    summary: `${top.count} of ${refs.length} awards in our data involve the same buyer, ${top.name}${years.length > 1 ? ` (${years[0]}-${years[years.length - 1]})` : ''}.`,
    evidence: {
      buyerName: top.name,
      buyerAwardCount: top.count,
      totalAwardCount: refs.length,
      awardIds: top.ids.slice(0, 5),
      years,
    },
  };
}

/** BUYER_EXPANSION: the supplier's first-half awards must be concentrated in <=2 buyers, with >=3 genuinely new buyers appearing only in the second half. */
function detectBuyerExpansion(dated: DatedRef[]): DetectedCompanyStory | null {
  if (dated.length < 6) return null;

  const sorted = [...dated].sort((a, b) => (a.date < b.date ? -1 : 1));
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);
  const firstBuyers = new Set(
    firstHalf.flatMap((r) => r.buyerNames).filter((n) => n !== 'unknown'),
  );
  const secondBuyers = new Set(
    secondHalf.flatMap((r) => r.buyerNames).filter((n) => n !== 'unknown'),
  );

  if (firstBuyers.size > 2) return null;

  const newBuyers = Array.from(secondBuyers).filter((b) => !firstBuyers.has(b));

  if (newBuyers.length < 3) return null;

  const score = Math.min(1, 0.5 + newBuyers.length * 0.1);

  return {
    type: 'buyer_expansion',
    score,
    summary: `Started with ${firstBuyers.size || 'no named'} buyer(s) early in our data, then went on to win from ${newBuyers.length} additional, previously-unseen buyers.`,
    evidence: {
      earlyBuyers: Array.from(firstBuyers),
      newBuyers,
    },
  };
}

/** MARKET_EXPANSION: the supplier's early awards must be in <=1 country, with a genuinely new country appearing later. */
function detectMarketExpansion(dated: DatedRef[]): DetectedCompanyStory | null {
  if (dated.length < 6) return null;

  const sorted = [...dated].sort((a, b) => (a.date < b.date ? -1 : 1));
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);
  const firstCountries = new Set(firstHalf.flatMap((r) => r.countries));
  const secondCountries = new Set(secondHalf.flatMap((r) => r.countries));

  if (firstCountries.size > 1) return null;

  const newCountries = Array.from(secondCountries).filter(
    (c) => !firstCountries.has(c),
  );

  if (newCountries.length < 1) return null;

  const score = Math.min(1, 0.6 + newCountries.length * 0.15);

  return {
    type: 'market_expansion',
    score,
    summary: `Early awards in our data were in ${Array.from(firstCountries).join(', ') || 'one market'}; more recent awards also appear in ${newCountries.join(', ')}.`,
    evidence: {
      earlyCountries: Array.from(firstCountries),
      newCountries,
    },
  };
}

/** EXCEPTIONAL_WIN: the top award must be compared against the median of the supplier's OTHER disclosed awards (never just the immediately preceding one), and be at least 3x that median. */
function detectExceptionalWin(refs: CompanyStoryAwardRef[]): DetectedCompanyStory | null {
  const valued = refs.filter(isValued);

  if (valued.length < 5) return null;

  const top = [...valued].sort((a, b) => b.valueEur - a.valueEur)[0];
  const rest = valued.filter((r) => r.id !== top.id).map((r) => r.valueEur);

  if (rest.length < 4) return null;

  const med = median(rest);

  if (med <= 0) return null;

  const ratio = top.valueEur / med;

  if (ratio < 3) return null;

  const score = Math.min(1, 0.4 + Math.min(ratio, 20) * 0.03);

  return {
    type: 'exceptional_win',
    score,
    summary: `Its ${euro(top.valueEur)} award (${top.date ?? 'date unknown'}) is ${ratio.toFixed(1)}x the median of its other disclosed awards in our data (${euro(med)}).`,
    evidence: {
      awardId: top.id,
      title: top.title,
      buyerNames: top.buyerNames,
      valueEur: top.valueEur,
      date: top.date,
      medianOfOtherAwardsEur: Math.round(med),
      ratio: Math.round(ratio * 10) / 10,
    },
  };
}

/**
 * SPECIALIZATION: requires >=6 awards with a known CPV code and >=60% of
 * them sharing the same CPV division (first 2 digits) — but a high
 * concentration ratio alone is NOT sufficient. A pharmaceutical company
 * having 64/65 pharmaceutical-category awards is mathematically a strong
 * pattern but tells the reader nothing they wouldn't already assume — it's
 * expected, not informative. We have no independent "declared industry"
 * field to check that against (using the company's name/reputation would
 * require the LLM to guess from world knowledge, reopening the door to
 * hallucination), so instead we use a real, data-only proxy for
 * "surprising, not just concentrated": does this concentration hold up
 * despite the supplier otherwise operating across many different buyers,
 * countries, and years? A supplier that's narrow in every dimension (one
 * buyer, one country) isn't a story — it may just be a small, single-client
 * business, and its category concentration is a side effect of that, not
 * a finding. A supplier with broad reach (several buyers/countries/years)
 * that STILL concentrates on one category is the genuinely tellable case.
 * Pattern strength and storyworthiness are scored and gated separately.
 */
function detectSpecialization(refs: CompanyStoryAwardRef[]): DetectedCompanyStory | null {
  const withCpv = refs.filter((r) => r.cpvCodes.length > 0);

  if (withCpv.length < 6) return null;

  const counts = new Map<
    string,
    { count: number; titles: string[]; buyers: Set<string>; countries: Set<string>; years: Set<string> }
  >();

  for (const ref of withCpv) {
    const division = ref.cpvCodes[0].slice(0, 2);
    const bucket =
      counts.get(division) ??
      { count: 0, titles: [], buyers: new Set<string>(), countries: new Set<string>(), years: new Set<string>() };

    bucket.count += 1;
    if (bucket.titles.length < 3) bucket.titles.push(ref.title);
    for (const name of ref.buyerNames) if (name !== 'unknown') bucket.buyers.add(name);
    for (const country of ref.countries) bucket.countries.add(country);
    if (ref.date) bucket.years.add(ref.date.slice(0, 4));
    counts.set(division, bucket);
  }

  let top:
    | { division: string; count: number; titles: string[]; buyers: Set<string>; countries: Set<string>; years: Set<string> }
    | null = null;

  for (const [division, bucket] of counts) {
    if (!top || bucket.count > top.count) top = { division, ...bucket };
  }

  if (!top) return null;

  const patternConfidence = top.count / withCpv.length;

  if (patternConfidence < 0.6) return null;

  // Novelty proxy: reach across buyers/countries/years despite the
  // concentration. Capped contributions so no single dimension dominates.
  const buyerDiversity = Math.min(top.buyers.size, 5) / 5;
  const countryDiversity = Math.min(top.countries.size, 3) / 3;
  const yearDiversity = Math.min(top.years.size, 4) / 4;
  const storyworthiness = 0.15 + 0.5 * buyerDiversity + 0.2 * countryDiversity + 0.15 * yearDiversity;

  // Require BOTH axes: a mathematically strong concentration that is also
  // demonstrated across enough distinct contexts to be worth reporting.
  if (storyworthiness < 0.55) return null;

  const score = patternConfidence * 0.55 + storyworthiness * 0.45;

  return {
    type: 'specialization',
    score,
    summary: `${top.count} of ${withCpv.length} awards with a known category in our data are the same type of work — e.g. "${top.titles[0]}" — across ${top.buyers.size} different buyer(s) in ${top.countries.size} countr${top.countries.size === 1 ? 'y' : 'ies'}.`,
    evidence: {
      cpvDivision: top.division,
      matchingCount: top.count,
      totalWithCategory: withCpv.length,
      exampleTitles: top.titles,
      buyerCount: top.buyers.size,
      countryCount: top.countries.size,
      patternConfidence: Math.round(patternConfidence * 100) / 100,
      storyworthiness: Math.round(storyworthiness * 100) / 100,
    },
  };
}

/** MILESTONE: only a clean, round threshold — either the Nth award at a round number, or the latest award being the one that pushed cumulative disclosed value past a round figure. Never an arbitrary number. */
function detectMilestone(
  refs: CompanyStoryAwardRef[],
  awardCount: number,
  latestAwardId: string | null,
): DetectedCompanyStory | null {
  const roundCounts = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500];

  if (roundCounts.includes(awardCount)) {
    return {
      type: 'milestone',
      score: 0.8,
      summary: `This is the ${awardCount}th award we've recorded for this supplier in our data.`,
      evidence: { awardCount },
    };
  }

  const dated = refs
    .filter((r): r is DatedRef & ValuedRef => r.date !== null && typeof r.valueEur === 'number')
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const thresholds = [
    10_000_000, 25_000_000, 50_000_000, 100_000_000, 250_000_000,
    500_000_000, 1_000_000_000,
  ];
  let running = 0;

  for (const ref of dated) {
    const before = running;

    running += ref.valueEur;

    const crossed = thresholds.find((t) => before < t && running >= t);

    if (crossed && ref.id === latestAwardId) {
      return {
        type: 'milestone',
        score: 0.8,
        summary: `Its latest award pushed disclosed cumulative value in our data past ${euro(crossed)}.`,
        evidence: { threshold: crossed, cumulativeAfterEur: Math.round(running) },
      };
    }
  }

  return null;
}

/**
 * Runs every detector and returns the single best-scoring pattern, or null
 * if nothing clears COMPANY_STORY_REQUIRED_SCORE. `refs` must be the
 * supplier's FULL award list (not trimmed for prompt length).
 */
export function detectCompanyStoryPattern(
  refs: CompanyStoryAwardRef[],
  aux: { awardCount: number; latestAwardId: string | null },
): DetectedCompanyStory | null {
  const dated = refs.filter(isDated);

  const candidates = [
    detectGrowth(dated),
    detectAcceleration(dated),
    detectRepeatBuyer(refs),
    detectBuyerExpansion(dated),
    detectMarketExpansion(dated),
    detectExceptionalWin(refs),
    detectSpecialization(refs),
    detectMilestone(refs, aux.awardCount, aux.latestAwardId),
  ].filter((c): c is DetectedCompanyStory => c !== null);

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));

  return best.score >= COMPANY_STORY_REQUIRED_SCORE ? best : null;
}
