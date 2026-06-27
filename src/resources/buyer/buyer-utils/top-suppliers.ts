import { AwardTenderDocument } from '@/resources/award-tender/schemas';
import { Types } from 'mongoose';
import { BuyerStats } from '../schemas';
import { getMongoRelationObjectIdArray } from '@/utils';

export function getTopSuppliersStats(
  awardTenders: AwardTenderDocument[],
): BuyerStats['topSuppliers'] {
  const statsByWinner = new Map<
    string,
    BuyerStats['topSuppliers'][number]
  >();

  for (const awardTender of awardTenders) {
    const winners = getMongoRelationObjectIdArray(awardTender.winners ?? []).map(
      (winnerId) => new Types.ObjectId(winnerId),
    );
    const awardedValueEur =
      typeof awardTender.awardValueEur === 'number' &&
      Number.isFinite(awardTender.awardValueEur)
        ? awardTender.awardValueEur
        : 0;

    for (const winner of winners) {
      const winnerId = winner.toString();
      const stats = statsByWinner.get(winnerId) ?? {
        winner,
        wins: 0,
        totalAwardedValueEur: 0,
      };

      stats.wins += 1;
      stats.totalAwardedValueEur += awardedValueEur;
      statsByWinner.set(winnerId, stats);
    }
  }

  return Array.from(statsByWinner.values()).sort(
    (a, b) =>
      b.wins - a.wins ||
      b.totalAwardedValueEur - a.totalAwardedValueEur ||
      a.winner.toString().localeCompare(b.winner.toString()),
  );
}
