import { AwardTenderDocument } from '@/resources/award-tender/schemas';
import { TenderDocument } from '@/resources/tenders/schemas';
import { BuyerStats } from '../schemas';

function getFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getAwardTenderAwardValueEur(
  awardTender: AwardTenderDocument,
): number | null {
  const tenderAwardValue = getFiniteNumber(awardTender.awardValueEur);

  if (tenderAwardValue !== null) {
    return tenderAwardValue;
  }

  const lotAwardValue = (awardTender.lots ?? [])
    .map((lot) => getFiniteNumber(lot.awardValueEur))
    .filter((value): value is number => value !== null)
    .reduce((acc, value) => acc + value, 0);

  if (lotAwardValue > 0) {
    return lotAwardValue;
  }

  return getFiniteNumber(awardTender.estimatedValueEur);
}

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
    const money = getFiniteNumber(tender.estimatedValueEur);
    const isMoneyValid = money !== null && tender.leadBuyers.length;

    return isMoneyValid ? [money / tender.leadBuyers.length] : [];
  });

  const awardedValueEurValues = awardTenders.flatMap((awardTender) => {
    const money = getAwardTenderAwardValueEur(awardTender);
    const isMoneyValid = money !== null && awardTender.leadBuyers.length;

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
