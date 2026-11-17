import type { TenderDocument } from '@/resources/tenders/schemas';
import {
  NationalTenderAmendment,
  NationalTenderBuyer,
  NationalTenderSource,
} from './national-tender.types';
import type { NationalTender } from './schemas/national-tender.schema';

/** Mongoose model name of `national_tenders`, for polymorphic refs. */
export const NATIONAL_TENDER_MODEL_NAME = 'NationalTender';
export const TED_TENDER_MODEL_NAME = 'Tender';

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
    Array.isArray((value as { buyers?: unknown }).buyers)
  );
}

/** Buyer in the shape of a serialized TED `Buyer` (without `id`: no buyer page). */
export interface NationalTenderBuyerDto {
  name: string;
  address: {
    street?: string;
    postCode?: string;
    city?: string;
    country: string;
    countrySub?: string;
  };
  contact: { email?: string; website?: string };
  identifiers: string[];
  legalTypes: { name: string }[];
  mainActivities: { name: string }[];
  websites: string[];
}

export type NationalTenderAmendmentDto = Omit<NationalTenderAmendment, 'patch'>;

/** National tender served as `TenderDto` (see FRONTEND_CONTRACT.md). */
export type NationalTenderDetailDto = Omit<
  NationalTender,
  'buyers' | 'amendments' | 'rawData' | 'sourceHash'
> & {
  sourceNoticeId: string;
  leadBuyers: NationalTenderBuyerDto[];
  nonLeadBuyers: NationalTenderBuyerDto[];
  amendments: NationalTenderAmendmentDto[];
};

function serializeBuyer(buyer: NationalTenderBuyer): NationalTenderBuyerDto {
  const identifiers = [
    buyer.nationalId ? `NIP ${buyer.nationalId}` : undefined,
    buyer.registryId,
  ].filter((value): value is string => !!value);

  return {
    name: buyer.name,
    address: {
      street: buyer.street,
      postCode: buyer.postalCode,
      city: buyer.city,
      country: buyer.country,
      countrySub: buyer.nuts,
    },
    contact: { email: buyer.email, website: buyer.website },
    identifiers,
    legalTypes: buyer.legalType ? [{ name: buyer.legalType }] : [],
    mainActivities: buyer.mainActivity ? [{ name: buyer.mainActivity }] : [],
    websites: buyer.website ? [buyer.website] : [],
  };
}

export function serializeNationalTenderDetail(
  tender: NationalTender,
): NationalTenderDetailDto {
  const {
    buyers,
    amendments,
    rawData: _rawData,
    sourceHash: _sourceHash,
    ...rest
  } = tender as NationalTender & { __v?: number };
  const buyerDtos = (buyers ?? []).map(serializeBuyer);

  delete (rest as { __v?: number }).__v;

  return {
    ...rest,
    sourceNoticeId: tender.sourceId,
    leadBuyers: buyerDtos.slice(0, 1),
    nonLeadBuyers: buyerDtos.slice(1),
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
 * `TenderDocument`: buyers as `leadBuyers`, no TED links, and the source
 * notice (from `rawData`, when selected) instead of the TED XML.
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
