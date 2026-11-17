/** `NoticeType` values accepted by the BZP notice API. */
export enum BzpNoticeType {
  /** Ogłoszenie o zamówieniu — new tender. */
  CONTRACT_NOTICE = 'ContractNotice',
  /** Ogłoszenie o zmianie ogłoszenia — changes (deadline etc.). */
  NOTICE_UPDATE_NOTICE = 'NoticeUpdateNotice',
  /** Ogłoszenie o wyniku postępowania — result. */
  TENDER_RESULT_NOTICE = 'TenderResultNotice',
  AGREEMENT_INTENTION_NOTICE = 'AgreementIntentionNotice',
  CONTRACT_PERFORMING_NOTICE = 'ContractPerformingNotice',
  COMPETITION_NOTICE = 'CompetitionNotice',
  COMPETITION_RESULT_NOTICE = 'CompetitionResultNotice',
  SMALL_CONTRACT_NOTICE = 'SmallContractNotice',
  AGREEMENT_UPDATE_NOTICE = 'AgreementUpdateNotice',
}

export type BzpOrderType = 'Delivery' | 'Services' | 'Works';

/** One element of the BZP notice API response (field names verbatim). */
export interface BzpNotice {
  clientType: string;
  /** Usually a `BzpOrderType`; string for unknown values. */
  orderType: string;
  tenderType: string;
  /** Usually a `BzpNoticeType`; string for unknown values. */
  noticeType: string;
  /** "2026/BZP 00531057/01" — with version suffix. */
  noticeNumber: string;
  /** "2026/BZP 00531057". */
  bzpNumber: string;
  isTenderAmountBelowEU: boolean;
  publicationDate: string;
  orderObject: string;
  /** "45112723-9 (Name),45111291-4 (Name)" — main code first. */
  cpvCode: string | null;
  submittingOffersDate: string | null;
  procedureResult: unknown;
  organizationName: string;
  organizationCity: string | null;
  /** Province code, e.g. "PL24". */
  organizationProvince: string | null;
  organizationCountry: string | null;
  organizationNationalId: string | null;
  organizationId: string | null;
  /** OCDS procedure id, e.g. "ocds-148610-8442f7ff-...". */
  tenderId: string | null;
  /** Full notice as an HTML document (sections I–VIII). */
  htmlBody: string;
  contractors: unknown;
  /** Internal GUID; also the `SearchAfter` pagination cursor. */
  objectId: string;
}

export interface BzpNoticeQuery {
  noticeType: BzpNoticeType;
  publicationDateFrom: Date;
  publicationDateTo: Date;
}
