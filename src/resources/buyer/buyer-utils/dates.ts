import { AwardTenderDocument } from '@/resources/award-tender/schemas';
import { TenderDocument } from '@/resources/tenders/schemas';
import { getEarliestDate, getLatestDate } from '@/utils';
import { BuyerStats } from '../schemas';

export function getDatesBuyerTendersStats(
  tenders: TenderDocument[],
  awardTenders: AwardTenderDocument[],
): Pick<
  BuyerStats,
  'lastAwardDate' | 'firstPublicationDate' | 'lastPublicationDate'
> {
  const awardDates = awardTenders.map((t) => t.publicationDate);
  const tenderDates = tenders.map((t) => t.publicationDate);

  const publicationDates = [...tenderDates, ...awardDates];
  const firstPublicationDate = getEarliestDate(publicationDates);
  const lastPublicationDate = getLatestDate(publicationDates);
  const lastAwardDate = getLatestDate(awardDates);

  return {
    lastAwardDate,
    firstPublicationDate,
    lastPublicationDate,
  };
}
