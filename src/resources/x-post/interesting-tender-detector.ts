/**
 * Deterministic "Interesting Tender" pattern detection — the same
 * detect-first, phrase-second discipline as company-story-detector.ts,
 * applied to open tenders instead of award histories.
 *
 * The old approach (sort currently-open tenders by value_desc, hand the top
 * one to the model) treats "biggest number" as the story. It isn't: a €20bn
 * figure on a Dynamic Purchasing System is a ceiling over several years, not
 * a single purchase, and even when the number is genuinely a lump sum, "it's
 * big" tells the reader nothing about *why* it's worth their attention.
 * Every detector below requires a real baseline comparison (a category
 * median, a buyer's own publishing history, a genuine rarity count) — never
 * a bare "this is the biggest one we found".
 */

export type InterestingTenderPatternType =
  | 'exceptional_value'
  | 'long_term_mechanism'
  | 'complex_structure'
  | 'short_deadline'
  | 'cross_border'
  | 'rare_category'
  | 'unusual_buyer';

export interface DetectedInterestingTender {
  type: InterestingTenderPatternType;
  /** 0-1 confidence this is a genuinely tellable signal — see INTERESTING_TENDER_REQUIRED_SCORE. */
  score: number;
  summary: string;
  evidence: Record<string, unknown>;
}

export interface TenderCandidateFacts {
  id: string;
  title: string;
  buyerNames: string[];
  /** How many tenders this buyer has published in our data, if known — a low count flags a rare/first-time publisher. */
  buyerTendersCount: number | null;
  countries: string[];
  cpvCodes: string[];
  estimatedValueEur: number | null;
  submissionDeadline: string | null;
  isFrameworkAgreement: boolean;
  isDps: boolean;
  lotsCount: number;
  /** Approximate mechanism/contract duration in months, from planned start/end dates. */
  durationMonths: number | null;
  /** Median estimated value among other currently-open tenders sharing this tender's CPV division (first 2 digits) — the real baseline exceptional_value is measured against. */
  categoryMedianValueEur: number | null;
  categorySampleSize: number;
  /** How many tenders (any status, all time) in our data share this tender's exact leading CPV code — a low count flags a genuinely rare procurement category. */
  historicalCategoryCount: number | null;
  url: string;
}

export const INTERESTING_TENDER_REQUIRED_SCORE = 0.6;

const DAY_MS = 24 * 60 * 60 * 1000;

function euro(amount: number): string {
  if (amount >= 1_000_000_000) return `€${(amount / 1_000_000_000).toFixed(1)}bn`;
  if (amount >= 1_000_000) return `€${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `€${(amount / 1_000).toFixed(0)}k`;

  return `€${amount.toLocaleString('en-US')}`;
}

/** How a large value should be phrased — the fix for the ESTAR/€20bn framing bug: a DPS/framework's estimated value is a ceiling over its lifetime, never a single purchase. */
function valueRepresents(
  facts: Pick<TenderCandidateFacts, 'isDps' | 'isFrameworkAgreement'>,
): 'ceiling_over_multiple_years' | 'estimated_contract_value' {
  return facts.isDps || facts.isFrameworkAgreement
    ? 'ceiling_over_multiple_years'
    : 'estimated_contract_value';
}

/**
 * EXCEPTIONAL_VALUE: the tender's estimated value must be at least 5x the
 * median of OTHER currently-open tenders in the same CPV division (min. 5
 * comparable tenders), scored logarithmically so the gap between "notably
 * above average" and "order-of-magnitude outlier" is reflected honestly —
 * never a bare "this is the biggest number we found".
 */
function detectExceptionalValue(
  facts: TenderCandidateFacts,
): DetectedInterestingTender | null {
  if (
    typeof facts.estimatedValueEur !== 'number' ||
    typeof facts.categoryMedianValueEur !== 'number' ||
    facts.categoryMedianValueEur <= 0 ||
    facts.categorySampleSize < 5
  ) {
    return null;
  }

  const ratio = facts.estimatedValueEur / facts.categoryMedianValueEur;

  if (ratio < 5) return null;

  const score = Math.min(1, 0.4 + 0.35 * Math.log10(ratio));

  return {
    type: 'exceptional_value',
    score,
    summary: `Its estimated value (${euro(facts.estimatedValueEur)}) is ~${ratio.toFixed(1)}x the median (${euro(facts.categoryMedianValueEur)}) among ${facts.categorySampleSize} other currently open tenders in the same CPV category.`,
    evidence: {
      estimatedValueEur: facts.estimatedValueEur,
      categoryMedianValueEur: Math.round(facts.categoryMedianValueEur),
      categorySampleSize: facts.categorySampleSize,
      ratio: Math.round(ratio * 10) / 10,
      valueRepresents: valueRepresents(facts),
      isDps: facts.isDps,
      isFrameworkAgreement: facts.isFrameworkAgreement,
    },
  };
}

/**
 * LONG_TERM_MECHANISM: a Dynamic Purchasing System or framework agreement
 * running for 2+ years — this is what makes a large ceiling value make
 * sense (it's spread over years of individual call-offs, not one purchase).
 */
function detectLongTermMechanism(
  facts: TenderCandidateFacts,
): DetectedInterestingTender | null {
  if (!facts.isDps && !facts.isFrameworkAgreement) return null;
  if (typeof facts.durationMonths !== 'number' || facts.durationMonths < 24) {
    return null;
  }

  const years = Math.round(facts.durationMonths / 12);
  const score = Math.min(
    1,
    0.55 + Math.min(facts.durationMonths - 24, 48) * 0.006,
  );

  return {
    type: 'long_term_mechanism',
    score,
    summary: `This is a ${facts.isDps ? 'dynamic purchasing system' : 'framework agreement'} running for approximately ${years} year${years === 1 ? '' : 's'}, not a single one-off contract.`,
    evidence: {
      isDps: facts.isDps,
      isFrameworkAgreement: facts.isFrameworkAgreement,
      durationMonths: facts.durationMonths,
      estimatedValueEur: facts.estimatedValueEur,
      valueRepresents: valueRepresents(facts),
    },
  };
}

/** COMPLEX_STRUCTURE: split into enough lots that the procurement is genuinely a program, not a single contract. */
function detectComplexStructure(
  facts: TenderCandidateFacts,
): DetectedInterestingTender | null {
  if (facts.lotsCount < 5) return null;

  const score = Math.min(1, 0.5 + (facts.lotsCount - 5) * 0.04);
  const mechanism = facts.isDps
    ? ' under a dynamic purchasing system'
    : facts.isFrameworkAgreement
      ? ' under a framework agreement'
      : '';

  return {
    type: 'complex_structure',
    score,
    summary: `Structured as ${facts.lotsCount} separate lots${mechanism}.`,
    evidence: {
      lotsCount: facts.lotsCount,
      isDps: facts.isDps,
      isFrameworkAgreement: facts.isFrameworkAgreement,
    },
  };
}

/** SHORT_DEADLINE: genuinely urgent (≤10 days left) AND large enough (≥€500k) to be worth flagging — never a tiny tender that's simply about to close. */
function detectShortDeadline(
  facts: TenderCandidateFacts,
): DetectedInterestingTender | null {
  if (!facts.submissionDeadline) return null;
  if (
    typeof facts.estimatedValueEur !== 'number' ||
    facts.estimatedValueEur < 500_000
  ) {
    return null;
  }

  const remainingDays =
    (new Date(facts.submissionDeadline).getTime() - Date.now()) / DAY_MS;

  if (remainingDays <= 0 || remainingDays > 10) return null;

  const score =
    remainingDays <= 3 ? 0.85 : remainingDays <= 6 ? 0.72 : 0.62;

  return {
    type: 'short_deadline',
    score,
    summary: `Only ${Math.ceil(remainingDays)} day(s) left to submit, for an estimated ${euro(facts.estimatedValueEur)} opportunity.`,
    evidence: {
      remainingDays: Math.ceil(remainingDays),
      submissionDeadline: facts.submissionDeadline,
      estimatedValueEur: facts.estimatedValueEur,
    },
  };
}

/** CROSS_BORDER: performance spans 2+ countries. */
function detectCrossBorder(
  facts: TenderCandidateFacts,
): DetectedInterestingTender | null {
  if (facts.countries.length < 2) return null;

  const score = Math.min(1, 0.55 + (facts.countries.length - 2) * 0.15);

  return {
    type: 'cross_border',
    score,
    summary: `Spans ${facts.countries.length} countries: ${facts.countries.join(', ')}.`,
    evidence: { countries: facts.countries },
  };
}

/** RARE_CATEGORY: very few tenders in our data (all-time, any status) share this exact leading CPV code — a genuinely uncommon procurement subject, not just a subjectively "unusual" title. */
function detectRareCategory(
  facts: TenderCandidateFacts,
): DetectedInterestingTender | null {
  if (
    facts.cpvCodes.length === 0 ||
    typeof facts.historicalCategoryCount !== 'number' ||
    facts.historicalCategoryCount > 3 ||
    facts.historicalCategoryCount < 1
  ) {
    return null;
  }

  const score =
    facts.historicalCategoryCount === 1
      ? 0.8
      : facts.historicalCategoryCount === 2
        ? 0.7
        : 0.62;

  return {
    type: 'rare_category',
    score,
    summary: `Only ${facts.historicalCategoryCount} tender${facts.historicalCategoryCount === 1 ? '' : 's'} with this exact CPV code (${facts.cpvCodes[0]}) exist in our data — an unusually rare procurement category.`,
    evidence: {
      cpvCode: facts.cpvCodes[0],
      historicalCategoryCount: facts.historicalCategoryCount,
    },
  };
}

/** UNUSUAL_BUYER: a buyer who has published very few tenders in our data, publishing a notably large one — a rare or first-time publisher at this scale. */
function detectUnusualBuyer(
  facts: TenderCandidateFacts,
): DetectedInterestingTender | null {
  if (
    typeof facts.buyerTendersCount !== 'number' ||
    facts.buyerTendersCount > 2 ||
    facts.buyerTendersCount < 1 ||
    typeof facts.estimatedValueEur !== 'number' ||
    facts.estimatedValueEur < 1_000_000 ||
    facts.buyerNames.length === 0
  ) {
    return null;
  }

  const score = facts.buyerTendersCount === 1 ? 0.72 : 0.62;

  return {
    type: 'unusual_buyer',
    score,
    summary: `${facts.buyerNames[0]} appears to have published only ${facts.buyerTendersCount} tender(s) in our data — a rare or first-time buyer at this scale.`,
    evidence: {
      buyerName: facts.buyerNames[0],
      buyerTendersCount: facts.buyerTendersCount,
      estimatedValueEur: facts.estimatedValueEur,
    },
  };
}

/**
 * Runs every detector and returns the single best-scoring pattern, or null
 * if nothing clears INTERESTING_TENDER_REQUIRED_SCORE.
 */
export function detectInterestingTenderPattern(
  facts: TenderCandidateFacts,
): DetectedInterestingTender | null {
  const candidates = [
    detectExceptionalValue(facts),
    detectLongTermMechanism(facts),
    detectComplexStructure(facts),
    detectShortDeadline(facts),
    detectCrossBorder(facts),
    detectRareCategory(facts),
    detectUnusualBuyer(facts),
  ].filter((c): c is DetectedInterestingTender => c !== null);

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));

  return best.score >= INTERESTING_TENDER_REQUIRED_SCORE ? best : null;
}
