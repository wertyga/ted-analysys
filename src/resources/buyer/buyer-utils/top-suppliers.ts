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

    for (const winner of winners) {
      const winnerId = winner.toString();
      const stats = statsByWinner.get(winnerId) ?? {
        winner,
        wins: 0,
      };

      stats.wins += 1;
      statsByWinner.set(winnerId, stats);
    }
  }

  return Array.from(statsByWinner.values()).sort(
    (a, b) =>
      b.wins - a.wins ||
      a.winner.toString().localeCompare(b.winner.toString()),
  );
}
