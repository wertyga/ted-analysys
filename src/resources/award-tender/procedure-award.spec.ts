import { Types } from 'mongoose';
import { buildProcedureAward } from './procedure-award';

describe('buildProcedureAward', () => {
  const winnerA = new Types.ObjectId();
  const winnerB = new Types.ObjectId();
  const names = new Map([
    [String(winnerA), 'Alpha Sp. z o.o.'],
    [String(winnerB), 'Beta S.A.'],
  ]);

  it('returns null without result notices', () => {
    expect(buildProcedureAward([], names)).toBeNull();
  });

  it('takes each lot from the newest notice and sums lot values', () => {
    const award = buildProcedureAward(
      [
        {
          id: 'pl-bzp-2026-00000002',
          publicationDate: new Date('2026-11-10'),
          awardDate: new Date('2026-11-08'),
          lots: [
            {
              identifier: 'LOT-0002',
              status: 'awarded',
              winner: winnerB,
              awardValue: { amount: 400, currency: 'PLN' },
              awardValueEur: 100,
              offersCount: 3,
            },
          ],
        },
        {
          id: 'pl-bzp-2026-00000001',
          publicationDate: new Date('2026-11-01'),
          awardDate: new Date('2026-10-30'),
          lots: [
            {
              identifier: 'LOT-0001',
              status: 'awarded',
              winner: winnerA,
              awardValueEur: 50,
            },
            { identifier: 'LOT-0002', status: 'unresolved' },
            {
              identifier: 'LOT-0010',
              status: 'cancelled',
              cancellationReason: 'no offers',
            },
          ],
        },
      ],
      names,
    );

    expect(award).toMatchObject({
      id: 'pl-bzp-2026-00000002',
      awardIds: ['pl-bzp-2026-00000002', 'pl-bzp-2026-00000001'],
      awardDate: new Date('2026-11-08'),
      awardValueEur: 150,
    });
    expect(
      award!.lots.map((lot) => [lot.identifier, lot.status, lot.awardId]),
    ).toEqual([
      ['LOT-0001', 'awarded', 'pl-bzp-2026-00000001'],
      ['LOT-0002', 'awarded', 'pl-bzp-2026-00000002'],
      ['LOT-0010', 'cancelled', 'pl-bzp-2026-00000001'],
    ]);
    expect(award!.lots[1]).toMatchObject({
      winner: { _id: String(winnerB), name: 'Beta S.A.' },
      awardValue: { amount: 400, currency: 'PLN' },
      offersCount: 3,
    });
    expect(award!.lots[2].cancellationReason).toBe('no offers');
  });

  it('derives TED lot status from the winner', () => {
    const award = buildProcedureAward(
      [
        {
          id: '756374-2026',
          publicationDate: new Date('2026-11-02'),
          awardDate: null,
          lots: [
            { identifier: 'LOT-0001', winner: winnerA },
            { identifier: 'LOT-0002' },
          ],
        },
      ],
      names,
    );

    expect(award!.lots.map((lot) => lot.status)).toEqual(['awarded', null]);
    expect(award!.awardValueEur).toBeNull();
  });
});
