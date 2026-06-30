import { AwardTenderDocument } from '@/resources/award-tender/schemas';
import { TenderDocument } from '@/resources/tenders/schemas';
import { BuyerStats } from '../schemas';

export function getMoneyBuyerTendersStats(
  tenders: TenderDocument[],
  awardTenders: AwardTenderDocument[],
): Pick<
  BuyerStats,
  | 'totalEstimatedValueEur'
  | 'totalAwardedValueEur'
  | 'avgEstimatedValueEur'
  | 'avgAwardedValueEur'
> {
  const estimatedValueEurValues = tenders.flatMap((tender) => {
    const isMoneyValid =
      typeof tender.estimatedValueEur === 'number' &&
      Number.isFinite(tender.estimatedValueEur) &&
      tender.leadBuyers.length;

    return isMoneyValid
      ? [(tender.estimatedValueEur as number) / tender.leadBuyers.length]
      : [];
  });

  const awardedValueEurValues = awardTenders.flatMap((awardTender) => {
    const money = awardTender.awardValueEur || awardTender.estimatedValueEur;
    const isMoneyValid =
      typeof money === 'number' &&
      Number.isFinite(money) &&
      awardTender.leadBuyers.length;

    return isMoneyValid ? [money / awardTender.leadBuyers.length] : [];
  });

  const totalEstimatedValueEur: number = estimatedValueEurValues
    .filter(Boolean)
    .reduce((acc: number, value: number) => acc + value, 0);
  const totalAwardedValueEur: number = awardedValueEurValues
    .filter(Boolean)
    .reduce((acc: number, value: number) => acc + value, 0);

  return {
    totalEstimatedValueEur,
    totalAwardedValueEur,
    avgEstimatedValueEur:
      estimatedValueEurValues.length > 0
        ? totalEstimatedValueEur / estimatedValueEurValues.length
        : 0,
    avgAwardedValueEur:
      awardedValueEurValues.length > 0
        ? totalAwardedValueEur / awardedValueEurValues.length
        : 0,
  };
}
