import { AwardTenderDocument } from '@/resources/award-tender/schemas';
import {
  BuyerIntelligenceSignal,
  BuyerStats,
  BuyerStatsIntelligence,
} from '../schemas';
import { getMongoRelationObjectIdArray } from '@/utils';

export type BuyerIntelligenceSignals = Pick<
  BuyerStatsIntelligence,
  'repeatSupplierRate' | 'localSupplierRate' | 'incumbentRisk' | 'localSupplierSignal'
>;

export type BuyerIntelligenceCalculation = BuyerIntelligenceSignals;

function getAwardTenderWinnerIds(awardTender: AwardTenderDocument): string[] {
  return getMongoRelationObjectIdArray(awardTender.winners ?? []);
}

function calculateIncumbentRiskMeta(
  topSuppliers: BuyerStats['topSuppliers'],
): Pick<BuyerIntelligenceCalculation, 'incumbentRisk' | 'repeatSupplierRate'> {
  const totalAwardsWithWinner = topSuppliers.reduce(
    (total, supplier) => total + supplier.wins,
    0,
  );
  const topSupplierWins = topSuppliers[0]?.wins ?? 0;
  const repeatSupplierWins = topSuppliers.reduce(
    (total, supplier) => total + (supplier.wins >= 2 ? supplier.wins : 0),
    0,
  );
  const topSupplierShare =
    totalAwardsWithWinner > 0 ? topSupplierWins / totalAwardsWithWinner : null;
  const repeatSupplierRate =
    totalAwardsWithWinner > 0
      ? repeatSupplierWins / totalAwardsWithWinner
      : null;

  if (totalAwardsWithWinner < 5) {
    return {
      incumbentRisk: BuyerIntelligenceSignal.UNKNOWN,
      repeatSupplierRate,
    };
  }

  const effectiveTopSupplierShare = topSupplierShare ?? 0;
  const effectiveRepeatSupplierRate = repeatSupplierRate ?? 0;

  if (effectiveTopSupplierShare >= 0.35 || effectiveRepeatSupplierRate >= 0.5) {
    return {
      incumbentRisk: BuyerIntelligenceSignal.HIGH,
      repeatSupplierRate,
    };
  }

  if (effectiveTopSupplierShare >= 0.2 || effectiveRepeatSupplierRate >= 0.25) {
    return {
      incumbentRisk: BuyerIntelligenceSignal.MEDIUM,
      repeatSupplierRate,
    };
  }

  return {
    incumbentRisk: BuyerIntelligenceSignal.LOW,
    repeatSupplierRate,
  };
}

function calculateLocalSupplierSignalMeta(
  buyerCountry: string | null | undefined,
  awardTenders: AwardTenderDocument[],
  winnerCountriesById: Map<string, string[]>,
): Pick<
  BuyerIntelligenceCalculation,
  'localSupplierSignal' | 'localSupplierRate'
> {
  if (!buyerCountry) {
    return {
      localSupplierSignal: BuyerIntelligenceSignal.UNKNOWN,
      localSupplierRate: null,
    };
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

  const localSupplierRate =
    awardsWithWinnerCountry > 0
      ? localWinnerAwards / awardsWithWinnerCountry
      : null;

  const effectiveLocalSupplierRate = localSupplierRate ?? 0;

  if (awardsWithWinnerCountry < 5) {
    return {
      localSupplierSignal: BuyerIntelligenceSignal.UNKNOWN,
      localSupplierRate,
    };
  }

  if (effectiveLocalSupplierRate >= 0.75) {
    return {
      localSupplierSignal: BuyerIntelligenceSignal.HIGH,
      localSupplierRate,
    };
  }

  if (effectiveLocalSupplierRate >= 0.5) {
    return {
      localSupplierSignal: BuyerIntelligenceSignal.MEDIUM,
      localSupplierRate,
    };
  }

  return {
    localSupplierSignal: BuyerIntelligenceSignal.LOW,
    localSupplierRate,
  };
}

export function calculateBuyerIntelligenceSignals(params: {
  buyerCountry: string | null | undefined;
  stats: BuyerStats;
  awardTenders: AwardTenderDocument[];
  winnerCountriesById: Map<string, string[]>;
}): BuyerIntelligenceCalculation {
  const incumbentRisk = calculateIncumbentRiskMeta(params.stats.topSuppliers);
  const localSupplierSignal = calculateLocalSupplierSignalMeta(
    params.buyerCountry,
    params.awardTenders,
    params.winnerCountriesById,
  );

  return {
    ...incumbentRisk,
    ...localSupplierSignal,
  };
}
