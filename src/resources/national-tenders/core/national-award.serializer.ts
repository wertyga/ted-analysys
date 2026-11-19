import { isNationalTenderId } from './national-tender.serializer';
import { NationalTenderSource } from './national-tender.types';
import type { NationalAwardTender } from './schemas/national-award-tender.schema';

/** Model name of `national_award_tenders`, for refs/merges. */
export const NATIONAL_AWARD_TENDER_MODEL_NAME = 'NationalAwardTender';

/** National award ids use the same source prefixes as national tenders. */
export const isNationalAwardId = (id: string): boolean => isNationalTenderId(id);

/** Fields added to every national award record served to the frontend. */
export interface NationalAwardSourceFields {
  source: NationalTenderSource;
  sourceUrl?: string;
  /** Notice number in the source (e.g. "2026/BZP 00541360"). */
  sourceNoticeId: string;
  country: string;
}

export function nationalAwardSourceFields(
  award: Pick<NationalAwardTender, 'source' | 'sourceUrl' | 'sourceId' | 'country'>,
): NationalAwardSourceFields {
  return {
    source: award.source,
    sourceUrl: award.sourceUrl,
    sourceNoticeId: award.sourceId,
    country: award.country,
  };
}

/** True for a national award record (lean or populated). */
export function isNationalAwardRecord(
  value: unknown,
): value is NationalAwardTender {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    isNationalAwardId((value as { id: string }).id) &&
    typeof (value as { source?: unknown }).source === 'string'
  );
}
