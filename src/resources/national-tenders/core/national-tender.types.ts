import { TenderLot, TenderShortTitle } from '@/resources/tenders/schemas';

/**
 * National (non-TED) tender sources. One value per portal, not per country:
 * a country can have several sources.
 */
export enum NationalTenderSource {
  /** Poland — Biuletyn Zamówień Publicznych on ezamowienia.gov.pl. */
  PL_BZP = 'PL_BZP',
}

/** Buyer data kept inline until national buyers are merged into `Buyer`. */
export interface NationalTenderBuyer {
  name: string;
  /** Tax id (NIP in Poland). */
  nationalId?: string;
  /** Other registry id as printed in the notice (e.g. "REGON 000302391"). */
  registryId?: string;
  /** Portal's own organization id. */
  sourceOrganizationId?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  /** ISO 3166-1 alpha-3. */
  country: string;
  /** NUTS code (most specific available). */
  nuts?: string;
  email?: string;
  website?: string;
  /** Buyer legal type as printed in the notice. */
  legalType?: string;
  /** Buyer main activity as printed in the notice. */
  mainActivity?: string;
}

export type NationalTenderLot = Omit<TenderLot, 'estimatedValueEur'>;

/**
 * Output of a country normalizer. Shape mirrors `Tender` so national tenders
 * can later be moved into the `tenders` collection without remapping.
 */
export interface NormalizedNationalTender {
  /** Canonical id, prefixed by source, e.g. `pl-bzp-2026-00531057`. */
  id: string;
  source: NationalTenderSource;
  /** Id of the notice in the source portal (e.g. BZP number). */
  sourceId: string;
  /** Id of the procedure in the source portal; shared by notices of one procedure. */
  sourceProcedureId?: string;
  /** Source notice type as returned by the portal. */
  sourceNoticeType: string;
  /** Source notice version (e.g. "01"). */
  sourceVersion?: string;
  /** Public page of the procedure. */
  sourceUrl?: string;
  /** ISO 3166-1 alpha-3 country of the source. */
  country: string;
  /** Whether the source marks the procedure as below EU thresholds. */
  isBelowEuThreshold?: boolean;

  /** TED-compatible notice type (`cn-standard` for contract notices). */
  noticeType: string;
  /** TED-compatible procedure type when it can be mapped. */
  procedureType?: string;
  title?: string;
  description?: string;
  estimatedValue?: { amount: number | null; currency: string | null };
  noticeLanguage?: string;
  submissionLanguages: string[];
  publicationDate?: Date;
  submissionDeadline?: Date;
  /** Planned duration when shared by all lots. */
  duration?: TenderLot['duration'];
  contractNature?: string;
  legalBasis?: string;
  electronicSubmission?: string;
  mainClassificationProc: string[];
  cpvCodes: string[];
  placeOfPerformanceCountries: string[];
  placeOfPerformanceSubdivisions: string[];
  placeOfPerformanceCities: string[];
  lots: NationalTenderLot[];
  documentUrls: string[];
  submissionUrls: string[];
  euFundLot?: boolean;
  buyers: NationalTenderBuyer[];
  /** Original notice payload from the source, for re-normalization. */
  rawData: unknown;
}

/** One field change announced by an amendment notice, as printed by the source. */
export interface NationalTenderChange {
  /** Field number in the source notice, e.g. "8.1". */
  field: string;
  /** Field label, e.g. "Termin składania ofert". */
  label?: string;
  before?: string;
  after?: string;
}

/** Normalized fields an amendment overrides. */
export type NationalTenderPatch = Partial<
  Pick<NormalizedNationalTender, 'submissionDeadline'>
>;

/**
 * Amendment notice applied to a stored tender (BZP `NoticeUpdateNotice` etc.).
 * `patch` is re-applied on top of every re-normalization of the original
 * notice, so an amended deadline survives re-collection.
 */
export interface NationalTenderAmendment {
  /** Id of the amendment notice in the source portal. */
  sourceId: string;
  publicationDate?: Date;
  changes: NationalTenderChange[];
  patch: NationalTenderPatch;
}

/** Output of a country amendment normalizer. */
export interface NormalizedNationalAmendment {
  source: NationalTenderSource;
  /** `sourceId` of the amended tender. */
  tenderSourceId: string;
  amendment: NationalTenderAmendment;
}

export type NationalAmendmentApplyStatus = 'applied' | 'duplicate' | 'notFound';

/** Winner of an awarded part, as printed by the source. */
export interface NationalAwardWinner {
  name: string;
  /** Tax id (NIP in Poland), digits only. */
  nationalId?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  /** ISO 3166-1 alpha-3. */
  country?: string;
  /** Awarded to a consortium (the leader is the winner). */
  isJointVenture?: boolean;
}

/** Outcome of one part of a procedure. */
export type NationalAwardLotStatus = 'awarded' | 'cancelled' | 'unresolved';

type Money = { amount: number | null; currency: string | null };

/** Part of a result notice; field names mirror `AwardTenderLot`. */
export interface NormalizedNationalAwardLot {
  identifier: string;
  title?: string;
  description?: string;
  contractNature?: string;
  mainClassification: string[];
  estimatedValue?: Money;
  status?: NationalAwardLotStatus;
  cancellationReason?: string;
  offersCount?: number;
  smeOffersCount?: number;
  lowestOfferValue?: Money;
  highestOfferValue?: Money;
  awardValue?: Money;
  contractConclusionDate?: Date;
  duration?: TenderLot['duration'];
  winner?: NationalAwardWinner;
}

/**
 * Output of a country result-notice normalizer. Field names mirror
 * `AwardTender` so TED award serializers and stats can read it.
 */
export interface NormalizedNationalAward {
  /** Canonical id from the result notice, e.g. `pl-bzp-2026-00536538`. */
  id: string;
  source: NationalTenderSource;
  /** Id of the result notice in the source portal. */
  sourceId: string;
  /** Procedure id, shared with the contract notice (`national_tenders`). */
  sourceProcedureId?: string;
  sourceUrl?: string;
  country: string;
  title?: string;
  contractNature?: string;
  cpvCodes: string[];
  publicationDate?: Date;
  estimatedValue?: Money;
  awardValue: Money;
  contractConclusionDates: Date[];
  awardDate: Date | null;
  placeOfPerformanceCountries: string[];
  lots: NormalizedNationalAwardLot[];
  /** Buyers as printed (resolved to shared `buyers` when stored). */
  buyers: NationalTenderBuyer[];
  rawData: unknown;
}

export interface NationalTenderStoreResult {
  saved: number;
  updated: number;
  unchanged: number;
  failed: number;
}

/** Outcome of storing one record (reported per record for live progress). */
export type NationalStoreOutcome = keyof NationalTenderStoreResult;

export interface NationalTenderShortTitleHolder {
  id: string;
  title?: string;
  shortTitle?: TenderShortTitle;
}
