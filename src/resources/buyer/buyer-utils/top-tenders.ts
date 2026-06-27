import { AwardTenderDocument } from '@/resources/award-tender/schemas';
import { TenderDocument } from '@/resources/tenders/schemas';
import { BuyerStats } from '../schemas';
import { getTopSuppliersStats } from './top-suppliers';
import { countUniqueValuesPerTender } from './value-counts';

export function getTopBuyerTendersStats(
  tenders: TenderDocument[],
  awardTenders: AwardTenderDocument[],
): Pick<BuyerStats, 'topCpvCodes' | 'topCountries' | 'topSuppliers'> {
  const allTenders = [...tenders, ...awardTenders];

  return {
    topCpvCodes: countUniqueValuesPerTender(
      allTenders,
      (tender) => tender.cpvCodes,
    ).map(({ value, count }) => ({
      code: value,
      count,
    })),
    topCountries: countUniqueValuesPerTender(
      allTenders,
      (tender) => tender.placeOfPerformanceCountries,
    ).map(({ value, count }) => ({
      country: value,
      count,
    })),
    topSuppliers: getTopSuppliersStats(awardTenders),
  };
}
