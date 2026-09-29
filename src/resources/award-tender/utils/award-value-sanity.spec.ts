import {
  restoreOriginalAwardValues,
  sanitizeLotAwardValues,
  sanitizeTenderAwardValue,
  SanitizableAwardLot,
} from './award-value-sanity';

const eur = (amount: number | null) => ({ amount, currency: 'EUR' });

const lot = (
  awardEur: number | null,
  estimatedEur: number | null = null,
  extra: Partial<SanitizableAwardLot> = {},
): SanitizableAwardLot => ({
  awardValue: eur(awardEur),
  awardValueEur: awardEur,
  estimatedValueEur: estimatedEur,
  ...extra,
});

function sanitize(
  tender: { awardEur: number | null; estimatedEur: number | null },
  lots: SanitizableAwardLot[],
) {
  const lotsResult = sanitizeLotAwardValues(lots);
  const tenderResult = sanitizeTenderAwardValue(
    {
      awardValue: eur(tender.awardEur),
      awardValueEur: tender.awardEur,
      estimatedValueEur: tender.estimatedEur,
    },
    lotsResult.lots,
  );

  return {
    lots: lotsResult.lots,
    tender: tenderResult.tender,
    corrections: [...lotsResult.corrections, ...tenderResult.corrections],
  };
}

// Cases below are real notices checked against TED XML
describe('award value sanity rules', () => {
  it('keeps plausible values untouched', () => {
    const result = sanitize({ awardEur: 900_000, estimatedEur: 1_000_000 }, [
      lot(900_000, 1_000_000),
    ]);

    expect(result.corrections).toEqual([]);
    expect(result.tender.awardValueEur).toBe(900_000);
  });

  it('uses lots sum when notice total is way bigger (391989-2024)', () => {
    const result = sanitize(
      { awardEur: 750_960_160_000, estimatedEur: 1_048_333 },
      [lot(769_495.78, 769_495.78), lot(278_837.67, 278_837.67)],
    );

    expect(result.tender.awardValueEur).toBeCloseTo(1_048_333.45);
    expect(result.corrections.map((c) => c.rule)).toEqual(['lots-sum']);
  });

  it('keeps a framework total above unit-price lots (477687-2023)', () => {
    // The estimate is the same TED field as the total, so it proves nothing
    const result = sanitize(
      { awardEur: 150_000_000, estimatedEur: 150_000_000 },
      [lot(100_000)],
    );

    expect(result.corrections).toEqual([]);
    expect(result.tender.awardValueEur).toBe(150_000_000);
  });

  it('uses lots sum when the total is exactly x1000 of it (220398-2024)', () => {
    const result = sanitize(
      { awardEur: 6_713_000_000, estimatedEur: 6_713_000_000 },
      [lot(6_713_000)],
    );

    expect(result.tender.awardValueEur).toBe(6_713_000);
    expect(result.corrections.map((c) => c.rule)).toEqual(['lots-sum']);
  });

  it('fixes dropped decimal point by tender range (370293-2024)', () => {
    const result = sanitize(
      { awardEur: 35_000_094_166, estimatedEur: 35_000_094_166 },
      [
        lot(29_745_741_813, null, {
          tenderValueRange: {
            lower: 297_457_418.13,
            higher: 396_091_079.17,
            currency: 'EUR',
          },
        }),
      ],
    );

    expect(result.lots[0].awardValue?.amount).toBeCloseTo(297_457_418.13);
    // The estimate equals the total, so the lots sum has no independent
    // support; the total is only dropped by the cap
    expect(result.tender.awardValueEur).toBeNull();
  });

  it('divides by 1000 when award is ~1000x the estimate (504750-2024)', () => {
    const result = sanitize({ awardEur: null, estimatedEur: 19_940_000 }, [
      lot(19_940_000_000, 19_940_000),
    ]);

    expect(result.lots[0].awardValueEur).toBe(19_940_000);
    expect(result.corrections[0]).toMatchObject({
      rule: 'estimate-ratio',
      factor: 1000,
    });
  });

  it('divides by 100 when award is ~100x the estimate (182986-2024)', () => {
    const result = sanitize(
      { awardEur: 10_120_698_315, estimatedEur: 101_206_983 },
      [],
    );

    expect(result.tender.awardValueEur).toBe(101_206_983);
  });

  it('drops the value when the ratio is arbitrary (330975-2024)', () => {
    const result = sanitize(
      { awardEur: 252_295_847_646, estimatedEur: 2_997_321 },
      [lot(null)],
    );

    expect(result.tender.awardValueEur).toBeNull();
    expect(result.tender.awardValue.amount).toBeNull();
  });

  it('drops values over the cap without other signals', () => {
    const result = sanitize(
      { awardEur: 30_000_000_000, estimatedEur: null },
      [],
    );

    expect(result.tender.awardValueEur).toBeNull();
    expect(result.corrections[0].rule).toBe('max-cap');
  });

  it('restores published values so rules can be re-applied', () => {
    const first = sanitize(
      { awardEur: 10_120_698_315, estimatedEur: 101_206_983 },
      [],
    );

    const restored = restoreOriginalAwardValues(
      { ...first.tender, lots: first.lots },
      first.corrections,
    );

    expect(restored.awardValueEur).toBe(10_120_698_315);
    expect(
      sanitize(
        { awardEur: restored.awardValueEur, estimatedEur: 101_206_983 },
        [],
      ).tender.awardValueEur,
    ).toBe(101_206_983);
  });
});
