import { AwardTenderDocument } from '@/resources/award-tender/schemas';
import { BuyerIntelligence, BuyerStats } from '../schemas';
import { Types } from 'mongoose';
import { getMongoRelationObjectIdArray } from '@/utils';

type BuyerIntelligenceSignal = 'unknown' | 'low' | 'medium' | 'high';

export type BuyerIntelligenceSignals = Pick<
  BuyerIntelligence,
  'incumbentRisk' | 'localSupplierSignal'
>;

function getAwardTenderWinnerIds(awardTender: AwardTenderDocument): string[] {
  return getMongoRelationObjectIdArray(awardTender.winners ?? []);
}

export function calculateIncumbentRisk(
  topSuppliers: BuyerStats['topSuppliers'],
): BuyerIntelligenceSignal {
  const totalAwardsWithWinner = topSuppliers.reduce(
    (total, supplier) => total + supplier.wins,
    0,
  );

  if (totalAwardsWithWinner < 5) {
    return 'unknown';
  }

  const topSupplierWins = topSuppliers[0]?.wins ?? 0;
  const repeatSupplierWins = topSuppliers.reduce(
    (total, supplier) => total + (supplier.wins >= 2 ? supplier.wins : 0),
    0,
  );
  const topSupplierShare = topSupplierWins / totalAwardsWithWinner;
  const repeatSupplierRate = repeatSupplierWins / totalAwardsWithWinner;

  if (topSupplierShare >= 0.35 || repeatSupplierRate >= 0.5) {
    return 'high';
  }

  if (topSupplierShare >= 0.2 || repeatSupplierRate >= 0.25) {
    return 'medium';
  }

  return 'low';
}

export function calculateLocalSupplierSignal(
  buyerCountry: string | null | undefined,
  awardTenders: AwardTenderDocument[],
  winnerCountriesById: Map<string, string[]>,
): BuyerIntelligenceSignal {
  if (!buyerCountry) {
    return 'unknown';
  }

  let awardsWithWinnerCountry = 0;
  let localWinnerAwards = 0;

  for (const awardTender of awardTenders) {
    for (const winnerId of getAwardTenderWinnerIds(awardTender)) {
      const winnerCountries = (winnerCountriesById.get(winnerId) ?? []).filter(
        Boolean,
      );

      if (!winnerCountries.length) {
        continue;
      }

      awardsWithWinnerCountry += 1;

      if (winnerCountries.includes(buyerCountry)) {
        localWinnerAwards += 1;
      }
    }
  }

  if (awardsWithWinnerCountry < 5) {
    return 'unknown';
  }

  const localSupplierRate = localWinnerAwards / awardsWithWinnerCountry;

  if (localSupplierRate >= 0.75) {
    return 'high';
  }

  if (localSupplierRate >= 0.5) {
    return 'medium';
  }

  return 'low';
}

export function calculateBuyerIntelligenceSignals(params: {
  buyerCountry: string | null | undefined;
  stats: BuyerStats;
  awardTenders: AwardTenderDocument[];
  winnerCountriesById: Map<string, string[]>;
}): BuyerIntelligenceSignals {
  return {
    incumbentRisk: calculateIncumbentRisk(params.stats.topSuppliers),
    localSupplierSignal: calculateLocalSupplierSignal(
      params.buyerCountry,
      params.awardTenders,
      params.winnerCountriesById,
    ),
  };
}
