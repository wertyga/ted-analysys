import { readFileSync } from 'fs';
import { join } from 'path';
import { BzpNotice } from './bzp.types';
import { normalizeBzpResultNotice } from './bzp-result.normalizer';

const fixture = (name: string): BzpNotice =>
  JSON.parse(
    readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8'),
  ) as BzpNotice;

describe('normalizeBzpResultNotice', () => {
  it('normalizes a multi-part result with winners and offers', () => {
    const award = normalizeBzpResultNotice(fixture('result-multi-part'))!;

    expect(award.id).toBe('pl-bzp-2026-00536542');
    expect(award.sourceProcedureId).toMatch(/^ocds-148610-/);
    expect(award.lots).toHaveLength(2);
    expect(award.lots.map((lot) => lot.status)).toEqual(['awarded', 'awarded']);

    const [lot] = award.lots;

    expect(lot.identifier).toBe('LOT-0001');
    expect(lot.mainClassification).toEqual(['30163000']);
    expect(lot.estimatedValue).toEqual({ amount: 704400, currency: 'PLN' });
    expect(lot.offersCount).toBe(1);
    expect(lot.lowestOfferValue).toEqual({ amount: 704400, currency: 'PLN' });
    expect(lot.awardValue).toEqual({ amount: 704400, currency: 'PLN' });
    expect(lot.contractConclusionDate?.toISOString()).toBe(
      '2026-11-13T00:00:00.000Z',
    );
    expect(lot.winner).toMatchObject({
      name: 'Pluxee Polska sp.zo.o.',
      nationalId: '0000033826',
      city: 'Warszawa',
      postalCode: '02-697',
      country: 'POL',
    });
    expect(award.awardValue).toEqual({ amount: 790400, currency: 'PLN' });
    expect(award.awardDate?.toISOString()).toBe('2026-11-13T00:00:00.000Z');
    expect(award.buyers[0].country).toBe('POL');
  });

  it('treats a notice without parts as one part', () => {
    const award = normalizeBzpResultNotice(fixture('result-single'))!;

    expect(award.lots).toHaveLength(1);
    expect(award.lots[0].status).toBe('awarded');
    expect(award.lots[0].estimatedValue).toEqual({
      amount: 419303.93,
      currency: 'PLN',
    });
    expect(award.lots[0].winner?.nationalId).toBe('6381811246');
  });

  it('takes the consortium leader as the winner', () => {
    const award = normalizeBzpResultNotice(fixture('result-joint'))!;
    const winner = award.lots[0].winner!;

    expect(winner.name).toMatch(/^Toruńskie Zakłady Materiałów Opatrunkowych/);
    expect(winner.nationalId).toBe('8790166790');
    expect(winner.isJointVenture).toBe(true);
    expect(award.lots[0].awardValue).toEqual({
      amount: 5110.35,
      currency: 'PLN',
    });
  });

  it('keeps cancelled parts without a winner or award value', () => {
    const award = normalizeBzpResultNotice(fixture('result-cancelled'))!;

    expect(award.lots[0].status).toBe('cancelled');
    expect(award.lots[0].winner).toBeUndefined();
    expect(award.lots[0].awardValue).toBeUndefined();
    expect(award.lots[0].cancellationReason).toMatch(/odmówił zawarcia umowy/);
    expect(award.awardValue.amount).toBeNull();
  });

  it('maps per-part statuses of mixed results', () => {
    const award = normalizeBzpResultNotice(fixture('result-mixed'))!;

    expect(award.lots.map((lot) => lot.status)).toEqual([
      'awarded',
      'cancelled',
    ]);
    expect(award.lots[1].winner).toBeUndefined();
  });
});
