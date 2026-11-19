import type { TenderDocument } from '@/resources/tenders/schemas';
import {
  NationalTenderAmendment,
  NationalTenderSource,
} from './national-tender.types';
import type { NationalTender } from './schemas/national-tender.schema';

/** Mongoose model name of `national_tenders`, for polymorphic refs. */
export const NATIONAL_TENDER_MODEL_NAME = 'NationalTender';
export const TED_TENDER_MODEL_NAME = 'Tender';

/** Populate of the shared buyers, same as TED `tenderPopulateFields`. */
export const NATIONAL_TENDER_POPULATE = [{ path: 'leadBuyers' }];

/** Id prefix → source. Ids are built by country normalizers. */
const NATIONAL_TENDER_ID_PREFIXES: Record<string, NationalTenderSource> = {
  'pl-bzp-': NationalTenderSource.PL_BZP,
};

export const isNationalTenderId = (id: string): boolean =>
  Object.keys(NATIONAL_TENDER_ID_PREFIXES).some((prefix) =>
    id.startsWith(prefix),
  );

/** Model name for refs to the tender with this id. */
export const getTenderModelName = (id: string) =>
  isNationalTenderId(id) ? NATIONAL_TENDER_MODEL_NAME : TED_TENDER_MODEL_NAME;

/** True for a raw `national_tenders` record (e.g. a populated ref). */
export function isNationalTenderRecord(
  value: unknown,
): value is NationalTender {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    isNationalTenderId((value as { id: string }).id) &&
    typeof (value as { source?: unknown }).source === 'string' &&
    typeof (value as { sourceHash?: unknown }).sourceHash === 'string'
  );
}

export type NationalTenderAmendmentDto = Omit<NationalTenderAmendment, 'patch'>;

/**
 * National tender served as `TenderDto` (see FRONTEND_CONTRACT.md).
 * `leadBuyers` are shared `Buyer`s: populated documents or ids, exactly as
 * TED tenders return them.
 */
export type NationalTenderDetailDto = Omit<
  NationalTender,
  'amendments' | 'rawData' | 'sourceHash'
> & {
  sourceNoticeId: string;
  nonLeadBuyers: [];
  amendments: NationalTenderAmendmentDto[];
};

export function serializeNationalTenderDetail(
  tender: NationalTender,
): NationalTenderDetailDto {
  const {
    amendments,
    rawData: _rawData,
    sourceHash: _sourceHash,
    ...rest
  } = tender as NationalTender & { __v?: number; buyers?: unknown };

  delete (rest as { __v?: number }).__v;
  // Legacy inline buyers (before the shared-buyers migration).
  delete (rest as { buyers?: unknown }).buyers;

  return {
    ...rest,
    leadBuyers: rest.leadBuyers ?? [],
    sourceNoticeId: tender.sourceId,
    nonLeadBuyers: [],
    amendments: (amendments ?? []).map(
      ({ patch: _patch, ...amendment }) => amendment,
    ),
  };
}

/** Full notice of the source as HTML, used as the analysis "notice document". */
const NOTICE_HTML: Record<
  NationalTenderSource,
  (rawData: unknown) => string | undefined
> = {
  // BZP: `htmlBody` is the complete notice (sections I–VIII).
  [NationalTenderSource.PL_BZP]: (rawData) => {
    const html = (rawData as { htmlBody?: unknown } | undefined)?.htmlBody;

    return typeof html === 'string' && html.trim() ? html : undefined;
  },
};

/** Notice document attached to a national tender for analysis. */
export interface NationalSourceNotice {
  url: string;
  html: string;
}

/**
 * Adapts a national tender to the fields analyses read from a TED
 * `TenderDocument` (populated `leadBuyers`, no TED links) and attaches the
 * source notice (from `rawData`, when selected) instead of the TED XML.
 */
export function toAnalysisTender(tender: NationalTender): TenderDocument {
  const html = tender.rawData
    ? NOTICE_HTML[tender.source]?.(tender.rawData)
    : undefined;
  const sourceNotice: NationalSourceNotice | undefined = html
    ? { url: tender.sourceUrl ?? tender.id, html }
    : undefined;

  return {
    ...serializeNationalTenderDetail(tender),
    sourceHash: tender.sourceHash,
    links: undefined,
    sourceNotice,
  } as unknown as TenderDocument;
}

/** Search results / lists: mirrors `TenderModel.serializeList` for TED. */
export type NationalTenderListDto = Omit<
  NationalTenderDetailDto,
  'amendments' | 'duration' | 'legalBasis' | 'submissionUrls' | 'lots'
> & {
  lots: Pick<
    NationalTender['lots'][number],
    'identifier' | 'isDps' | 'isSME' | 'isFrameworkAgreement'
  >[];
};

export function serializeNationalTenderList(
  tender: NationalTender,
): NationalTenderListDto {
  const {
    amendments: _amendments,
    duration: _duration,
    legalBasis: _legalBasis,
    submissionUrls: _submissionUrls,
    lots,
    ...rest
  } = serializeNationalTenderDetail(tender);

  return {
    ...rest,
    lots: (lots ?? []).map(
      ({ identifier, isDps, isSME, isFrameworkAgreement }) => ({
        identifier,
        isDps,
        isSME,
        isFrameworkAgreement,
      }),
    ),
  };
}
