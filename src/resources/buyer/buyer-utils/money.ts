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
  const estimatedValueEurValues = tenders.flatMap((tender) =>
    typeof tender.estimatedValueEur === 'number' &&
    Number.isFinite(tender.estimatedValueEur)
      ? [tender.estimatedValueEur]
      : [],
  );
  const awardedValueEurValues = awardTenders.flatMap((awardTender) =>
    typeof awardTender.awardValueEur === 'number' &&
    Number.isFinite(awardTender.awardValueEur)
      ? [awardTender.awardValueEur]
      : [],
  );
  const totalEstimatedValueEur = estimatedValueEurValues.reduce(
    (acc, value) => acc + value,
    0,
  );
  const totalAwardedValueEur = awardedValueEurValues.reduce(
    (acc, value) => acc + value,
    0,
  );

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
