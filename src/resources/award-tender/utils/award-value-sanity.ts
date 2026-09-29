/**
 * Sanity rules for award values published in TED.
 *
 * Buyers regularly publish award values with a dropped decimal separator
 * (x100) or extra thousands (x1000), which inflates buyer/contractor stats by
 * orders of magnitude. The rules below cross-check the value against other
 * fields of the same notice and either fix the shift or drop the value.
 */

export const MAX_AWARD_VALUE_EUR = 20_000_000_000;

// Award/estimate ratio at which we stop trusting the award value
const SUSPICIOUS_ESTIMATE_RATIO = 50;

// Smaller estimates are usually placeholders (1 EUR, 99 EUR) and prove nothing
const MIN_TRUSTED_ESTIMATE_EUR = 10_000;

// Smaller awards barely affect stats, so a wrong fix costs more than it gives
const MIN_CHECKED_AWARD_EUR = 1_000_000;

// Ratio bands that look like a dropped decimal point or extra "000"
const DECIMAL_SHIFT_BANDS = [
  { factor: 100, min: 50, max: 200 },
  { factor: 1000, min: 500, max: 2000 },
];

const RANGE_SHIFT_FACTORS = [100, 1000];
const RANGE_TOLERANCE = 0.01;

// Notice total this many times bigger than the sum of lots is not trusted
const LOTS_SUM_RATIO = 10;

// "Exactly x100 / x1000" for the notice total vs the lots sum
const EXACT_SHIFT_TOLERANCE = 0.01;

// Notice estimate often comes from the same TED field as the total
const isIndependentEstimate = (
  totalEur: number,
  estimatedValueEur?: number | null,
): estimatedValueEur is number =>
  isPositive(estimatedValueEur) &&
  estimatedValueEur >= MIN_TRUSTED_ESTIMATE_EUR &&
  Math.abs(totalEur / estimatedValueEur - 1) > EXACT_SHIFT_TOLERANCE;

const isLotsSumCloserToEstimate = (
  totalEur: number,
  lotsSumEur: number,
  estimatedValueEur?: number | null,
) =>
  isIndependentEstimate(totalEur, estimatedValueEur) &&
  Math.abs(Math.log10(lotsSumEur / estimatedValueEur)) <
    Math.abs(Math.log10(totalEur / estimatedValueEur));

export type AwardValueCorrectionRule =
  | 'tender-range'
  | 'estimate-ratio'
  | 'lots-sum'
  | 'max-cap';

export type AwardValueCorrection = {
  scope: 'tender' | 'lot';
  lotIndex?: number;
  rule: AwardValueCorrectionRule;
  // Divisor that was applied; null when the value was replaced or dropped
  factor: number | null;
  original: {
    amount: number | null;
    currency: string | null;
    eur: number | null;
  };
  corrected: {
    amount: number | null;
    currency: string | null;
    eur: number | null;
  };
};

export type TenderValueRange = {
  lower: number | null;
  higher: number | null;
  currency: string | null;
};

type Money = { amount?: number | null; currency?: string | null };

export type SanitizableAwardLot = {
  awardValue?: Money | null;
  awardValueEur?: number | null;
  estimatedValueEur?: number | null;
  tenderValueRange?: TenderValueRange | null;
};

export type SanitizableAwardTender = {
  awardValue: Money;
  awardValueEur: number | null;
  estimatedValueEur: number | null;
};

type ValueState = {
  amount: number | null;
  currency: string | null;
  eur: number | null;
};

type RuleResult = {
  rule: AwardValueCorrectionRule;
  factor: number | null;
  value: ValueState;
};

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const shiftValue = (value: ValueState, factor: number): ValueState => ({
  amount: isPositive(value.amount) ? value.amount / factor : value.amount,
  currency: value.currency,
  eur: isPositive(value.eur) ? Math.round(value.eur / factor) : value.eur,
});

const dropValue = (value: ValueState): ValueState => ({
  amount: null,
  currency: value.currency,
  eur: null,
});

/**
 * Winner's price must be inside [lowest tender; highest tender] of the lot.
 * Returns null when the value is fine or the range can't tell anything.
 */
function checkTenderRange(
  value: ValueState,
  range?: TenderValueRange | null,
): RuleResult | 'valid' | null {
  if (!range || !isPositive(range.lower) || !isPositive(range.higher)) {
    return null;
  }

  if (!isPositive(value.amount)) {
    return null;
  }

  if (range.currency && value.currency && range.currency !== value.currency) {
    return null;
  }

  const lower = range.lower * (1 - RANGE_TOLERANCE);
  const higher = range.higher * (1 + RANGE_TOLERANCE);
  const isInRange = (amount: number) => amount >= lower && amount <= higher;

  if (isInRange(value.amount)) {
    return 'valid';
  }

  for (const factor of RANGE_SHIFT_FACTORS) {
    if (isInRange(value.amount / factor)) {
      return {
        rule: 'tender-range',
        factor,
        value: shiftValue(value, factor),
      };
    }
  }

  return null;
}

function checkEstimateRatio(
  value: ValueState,
  estimatedValueEur?: number | null,
): RuleResult | null {
  if (
    !isPositive(value.eur) ||
    value.eur < MIN_CHECKED_AWARD_EUR ||
    !isPositive(estimatedValueEur) ||
    estimatedValueEur < MIN_TRUSTED_ESTIMATE_EUR
  ) {
    return null;
  }

  const ratio = value.eur / estimatedValueEur;

  if (ratio < SUSPICIOUS_ESTIMATE_RATIO) {
    return null;
  }

  const band = DECIMAL_SHIFT_BANDS.find(
    (b) => ratio >= b.min && ratio <= b.max,
  );

  return band
    ? {
        rule: 'estimate-ratio',
        factor: band.factor,
        value: shiftValue(value, band.factor),
      }
    : { rule: 'estimate-ratio', factor: null, value: dropValue(value) };
}

function checkMaxCap(value: ValueState): RuleResult | null {
  return isPositive(value.eur) && value.eur > MAX_AWARD_VALUE_EUR
    ? { rule: 'max-cap', factor: null, value: dropValue(value) }
    : null;
}

function toCorrection(
  scope: AwardValueCorrection['scope'],
  original: ValueState,
  result: RuleResult,
  lotIndex?: number,
): AwardValueCorrection {
  return {
    scope,
    ...(lotIndex !== undefined && { lotIndex }),
    rule: result.rule,
    factor: result.factor,
    original,
    corrected: result.value,
  };
}

export function sanitizeLotAwardValues<T extends SanitizableAwardLot>(
  lots: T[],
): { lots: T[]; corrections: AwardValueCorrection[] } {
  const corrections: AwardValueCorrection[] = [];

  const sanitizedLots = lots.map((lot, lotIndex) => {
    const original: ValueState = {
      amount: lot.awardValue?.amount ?? null,
      currency: lot.awardValue?.currency ?? null,
      eur: lot.awardValueEur ?? null,
    };

    const rangeResult = checkTenderRange(original, lot.tenderValueRange);
    let result: RuleResult | null =
      rangeResult === 'valid'
        ? null
        : (rangeResult ?? checkEstimateRatio(original, lot.estimatedValueEur));

    // The cap is checked on top of a shifted value as well
    const capResult = checkMaxCap(result?.value ?? original);
    if (capResult) {
      result = capResult;
    }

    if (!result) {
      return lot;
    }

    corrections.push(toCorrection('lot', original, result, lotIndex));

    return {
      ...lot,
      awardValue: {
        amount: result.value.amount,
        currency: result.value.currency,
      },
      awardValueEur: result.value.eur,
    };
  });

  return { lots: sanitizedLots, corrections };
}

/**
 * Expects lots to be sanitized already.
 */
export function sanitizeTenderAwardValue<T extends SanitizableAwardTender>(
  tender: T,
  lots: SanitizableAwardLot[],
): { tender: T; corrections: AwardValueCorrection[] } {
  const original: ValueState = {
    amount: tender.awardValue?.amount ?? null,
    currency: tender.awardValue?.currency ?? null,
    eur: tender.awardValueEur ?? null,
  };

  let result =
    checkLotsSum(original, lots, tender.estimatedValueEur) ??
    checkEstimateRatio(original, tender.estimatedValueEur);

  const capResult = checkMaxCap(result?.value ?? original);
  if (capResult) {
    result = capResult;
  }

  if (!result) {
    return { tender, corrections: [] };
  }

  return {
    tender: {
      ...tender,
      awardValue: {
        amount: result.value.amount,
        currency: result.value.currency,
      },
      awardValueEur: result.value.eur,
    },
    corrections: [toCorrection('tender', original, result)],
  };
}

/**
 * A notice total way above the lots sum is often legit (framework ceiling vs
 * unit prices), so the lots sum wins only with independent evidence.
 */
function checkLotsSum(
  value: ValueState,
  lots: SanitizableAwardLot[],
  estimatedValueEur?: number | null,
): RuleResult | null {
  // A partial lots sum says nothing about the notice total
  if (!lots.length || !lots.every((lot) => isPositive(lot.awardValueEur))) {
    return null;
  }

  const lotsSumEur = lots.reduce((acc, lot) => acc + lot.awardValueEur!, 0);

  if (
    !isPositive(value.eur) ||
    value.eur < MIN_CHECKED_AWARD_EUR ||
    value.eur < lotsSumEur * LOTS_SUM_RATIO
  ) {
    return null;
  }

  const ratio = value.eur / lotsSumEur;
  const isExactShift = RANGE_SHIFT_FACTORS.some(
    (factor) => Math.abs(ratio / factor - 1) <= EXACT_SHIFT_TOLERANCE,
  );

  if (
    !isExactShift &&
    !isLotsSumCloserToEstimate(value.eur, lotsSumEur, estimatedValueEur)
  ) {
    return null;
  }

  const currencies = new Set(lots.map((lot) => lot.awardValue?.currency));
  const [currency] = currencies;
  const hasSingleCurrency = currencies.size === 1 && !!currency;

  return {
    rule: 'lots-sum',
    factor: null,
    value: {
      amount: hasSingleCurrency
        ? lots.reduce((acc, lot) => acc + (lot.awardValue?.amount ?? 0), 0)
        : null,
      currency: hasSingleCurrency ? currency : null,
      eur: lotsSumEur,
    },
  };
}

/**
 * Puts back the values published in TED, so the rules can be re-applied.
 */
export function restoreOriginalAwardValues<
  T extends SanitizableAwardTender & { lots: SanitizableAwardLot[] },
>(tender: T, corrections: AwardValueCorrection[] = []): T {
  const lots = [...tender.lots];
  let restored: T = { ...tender };

  for (const correction of corrections) {
    const values = {
      awardValue: {
        amount: correction.original.amount,
        currency: correction.original.currency,
      },
      awardValueEur: correction.original.eur,
    };

    if (correction.scope === 'tender') {
      restored = { ...restored, ...values };
    } else if (correction.lotIndex !== undefined && lots[correction.lotIndex]) {
      lots[correction.lotIndex] = { ...lots[correction.lotIndex], ...values };
    }
  }

  return { ...restored, lots };
}
