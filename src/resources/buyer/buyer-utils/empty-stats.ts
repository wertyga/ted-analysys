import { BuyerStats } from '../schemas';

export function getEmptyBuyerStats(): BuyerStats {
  return {
    participatedAwardTendersCount: 0,
    participatedTendersCount: 0,
    tendersCount: 0,
    awardTendersCount: 0,
    totalEstimatedValueEur: 0,
    totalAwardedValueEur: 0,
    avgEstimatedValueEur: 0,
    avgAwardedValueEur: 0,
    topCpvCodes: [],
    topCountries: [],
    topSuppliers: [],
  };
}
