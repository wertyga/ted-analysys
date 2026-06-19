import mongoose, { Document, Model, Schema } from 'mongoose';
import { filterModel } from '@/utils';
import {
  TenderDetailDto,
  TenderDto,
  TenderListDto,
} from '@/resources/tenders/dto/tender.dto';

export type TenderDocumentsLinks = Record<
  'xml' | 'pdf' | 'pdfs' | 'html' | 'htmlDirect',
  Record<string, string>
>;

export type MoneyValue = number | null | undefined;

export interface TenderDuration {
  value: number | null | undefined;
  unit: string | null;
}

export interface TenderLot {
  identifier?: string;
  title?: string;
  description?: string;
  mainClassification?: string[];
  additionalClassifications?: string[];
  contractNature?: string;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  estimatedValue?: {
    amount: MoneyValue;
    currency: string | null;
  };
  frameworkMaximumValue?: {
    amount: MoneyValue;
    currency: string | null;
  };
  isFrameworkAgreement?: boolean;
  isDps?: boolean;
  isSME?: boolean;
  isEuFunded?: boolean;

  duration?: TenderDuration;

  deadlineReceiptTender: Date | undefined;
  questionsDeadline: Date | undefined;
  documentUrls: string[];
  submissionUrls: string[];
  electronicSubmission?: string;
  placeOfPerformanceCountry?: string;
  placeOfPerformanceSubdivision?: string;
  placeOfPerformanceCity?: string;
  awardCriteria?: {
    type: string | null | undefined;
    description: string | null | undefined;
    weight: number | null | undefined;
    weightCode?: string | null | undefined;
  };
  selectionCriteria?: {
    name: string | null | undefined;
    description: string | null | undefined;
  };
  selectionCriteriaSource?: string;
  estimatedValueEur?: MoneyValue;
}

export interface TenderShortTitle {
  en: string;
  de: string;
  fr: string;
  pl: string;
  ru: string;
}

export interface Tender {
  _id: string;
  /** Local canonical id. For TED tenders this is the publication number. */
  id: string;
  /** TED notice-type: notice kind such as contract notice, award notice, or planning notice. */
  noticeType?: string;
  /** TED notice-subtype: more specific eForms subtype inside the notice type. */
  noticeSubtype?: string;
  /** TED notice-version: version of the notice, useful for detecting changes. */
  noticeVersion?: string;
  /** TED procedure-type: open, restricted, negotiated, and similar procedure kinds. */
  procedureType?: string;
  /** Main card title, normally notice-title with procedure/lot title fallback. */
  title?: string;
  /** AI-generated short tender title translations for list/card display. */
  shortTitle?: TenderShortTitle;
  /** TED title-proc: title at procedure level. */
  titleProc?: string;
  /** TED description-proc, with lot description fallback when procedure description is absent. */
  description?: string;
  /** Estimated value selected from procedure value first, then lot value fallback. */
  estimatedValue?: {
    amount: number | null;
    currency: string | null;
  };
  /** Estimated value converted to EUR using stored daily exchange rates. */
  estimatedValueEur?: number | null;
  /** TED official-language: official notice/procedure/document language. */
  noticeLanguage?: string;
  /** TED submission-language: languages allowed for tender submission. */
  submissionLanguages?: string[];
  /** TED buyer-name: contracting buyer name. */
  buyerName?: string;
  /** TED buyer-identifier: buyer national or registry identifier. */
  buyerIdentifier?: string;
  /** TED buyer-country: country of the buyer, not necessarily place of performance. */
  buyerCountry?: string;
  /** TED buyer-city: buyer city. */
  buyerCity?: string;
  /** TED main-activity: buyer main activities. */
  buyerMainActivities?: string[];
  /** TED buyer-email: buyer contact email. */
  buyerEmail?: string;
  /** TED buyer-internet-address: buyer website. */
  buyerInternetAddress?: string;
  /** TED buyer-profile: buyer procurement profile URL. */
  buyerProfile?: string;
  /** TED publication-date: date when the notice was published on TED. */
  publicationDate?: Date;
  /** TED dispatch-date: date when the notice was dispatched for publication. */
  dispatchDate?: Date;
  /** Normalized submission deadline; uses lot tender deadline and falls back to TED deadline. */
  submissionDeadline?: Date;
  /** TED deadline-receipt-tender-*-lot combined as date/time when tenders/offers are due. */
  deadlineReceiptTender?: Date;
  /** TED deadline-receipt-answers-*-lot combined as buyer answers/clarifications deadline. */
  questionsDeadline?: Date;
  /** TED contract-duration-start-date-lot: earliest planned lot contract start date. */
  plannedStartDate?: Date;
  /** TED contract-duration-end-date-lot: latest planned lot contract end date. */
  plannedEndDate?: Date;
  /** TED duration-period-*-lot lifted to tender level when all lots share the same duration. */
  duration?: TenderDuration;
  /** TED contract-nature: works, supplies, or services. */
  contractNature?: string;
  /** TED legal-basis: legal act or directive/regulation basis for the procedure. */
  legalBasis?: string;
  /** Derived from TED dps-usage-lot: whether Dynamic Purchasing System is used. */
  isDps?: boolean;
  /** Derived from TED framework-agreement-lot: whether this is a framework agreement. */
  isFrameworkAgreement?: boolean;
  /** Derived from TED sme-lot: SME suitability/relevance indicator when present. */
  isSmeSuitable?: boolean;
  /** TED electronic-submission-lot: electronic submission requirement/availability value. */
  electronicSubmission?: string;
  /** TED main-classification-proc CPV codes. */
  mainClassificationProc?: string[];
  /** TED place-of-performance-country-* fields: countries where the contract is performed. */
  placeOfPerformanceCountries?: string[];
  /** TED place-of-performance-city-* fields: cities where the contract is performed. */
  placeOfPerformanceCities?: string[];
  /** TED place-of-performance-subdiv-* fields: subdivisions where the contract is performed. */
  placeOfPerformanceSubdivisions?: string[];
  /** TED lot-level fields grouped by lot index. */
  lots?: TenderLot[];
  /** TED document-url-lot: procurement document URLs. */
  documentUrls?: string[];
  /** TED submission-url-lot: URLs where tenders/submissions are filed. */
  submissionUrls?: string[];
  /** Derived from TED eu-fund-lot: whether EU funds/financing are indicated. */
  euFundLot?: boolean;
  /** TED selection-criterion-*-lot: lot-level selection criteria names/descriptions. */
  selectionCriteria?: unknown[];
  /** TED award-criterion-*-lot: lot-level award criteria names/descriptions/types/weights. */
  awardCriteria?: unknown[];
  /** Aggregated raw CPV code strings from classification/main/additional CPV fields. */
  cpvCodes?: string[];
  /** Raw TED links object, including notice/XML/HTML/document links when returned. */
  links?: TenderDocumentsLinks;
  /** Hash of the normalized tender source fields used to detect tender changes. */
  sourceHash: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderDocument = Tender & Document;
export type TenderRecord = Tender & { _id: unknown };
export type TenderSerializable = TenderDocument | TenderRecord;

export interface TenderModelType extends Model<TenderDocument> {
  serializeDetail(tender: TenderSerializable): TenderDetailDto;
  serializeList(tender: TenderSerializable): TenderListDto;
}

const TenderSchema = new Schema<TenderDocument, TenderModelType>(
  {
    id: { type: String, required: true, unique: true, index: true },
    noticeType: String,
    noticeSubtype: String,
    noticeVersion: String,
    procedureType: String,
    title: String,
    shortTitle: {
      en: String,
      de: String,
      fr: String,
      pl: String,
      ru: String,
    },
    titleProc: String,
    description: String,
    estimatedValue: {
      amount: { type: Number, default: null },
      currency: { type: String, default: null },
    },
    estimatedValueEur: { type: Number, default: null, index: true },
    noticeLanguage: String,
    submissionLanguages: {
      type: [String],
      default: undefined,
    },
    buyerName: String,
    buyerIdentifier: String,
    buyerCountry: String,
    buyerCity: String,
    buyerMainActivities: {
      type: [String],
      default: undefined,
    },
    buyerEmail: String,
    buyerInternetAddress: String,
    buyerProfile: String,
    publicationDate: Date,
    dispatchDate: Date,
    submissionDeadline: Date,
    deadlineReceiptTender: Date,
    questionsDeadline: Date,
    plannedStartDate: Date,
    plannedEndDate: Date,
    duration: {
      value: { type: Number, default: null },
      unit: { type: String, default: null },
    },
    contractNature: String,
    legalBasis: String,
    isDps: {
      type: Boolean,
      default: false,
      index: true,
    },
    isFrameworkAgreement: {
      type: Boolean,
      default: false,
      index: true,
    },
    isSmeSuitable: {
      type: Boolean,
      default: undefined,
      index: true,
    },
    electronicSubmission: String,
    mainClassificationProc: { type: [String], default: [] },
    placeOfPerformanceCountries: { type: [String], default: [] },
    placeOfPerformanceCities: { type: [String], default: [] },
    placeOfPerformanceSubdivisions: { type: [String], default: [] },
    lots: { type: [Schema.Types.Mixed], default: [] },
    documentUrls: { type: [String], default: [] },
    submissionUrls: { type: [String], default: [] },
    euFundLot: {
      type: Boolean,
      index: true,
    },
    selectionCriteria: { type: [Schema.Types.Mixed], default: [] },
    awardCriteria: { type: [Schema.Types.Mixed], default: [] },
    cpvCodes: { type: [String], default: [] },
    links: Schema.Types.Mixed,
    sourceHash: { type: String, required: true, index: true },
  },
  {
    collection: 'tenders',
    timestamps: true,
  },
);

TenderSchema.index(
  {
    cpvCodes: 1,
    noticeType: 1,
    buyerCountry: 1,
    publicationDate: -1,
    _id: -1,
  },
  { name: 'idx_cpv_notice_country_pubdate' },
);

TenderSchema.index(
  {
    cpvCodes: 1,
    noticeType: 1,
    publicationDate: -1,
    _id: -1,
  },
  { name: 'idx_cpv_notice_pubdate' },
);

TenderSchema.index(
  {
    noticeType: 1,
    buyerCountry: 1,
    publicationDate: -1,
    _id: -1,
  },
  { name: 'idx_notice_country_pubdate' },
);

function serializeTender(tender: TenderSerializable): TenderDto {
  return filterModel(tender as TenderDocument, {
    excludeFields: ['sourceHash'],
  }) as TenderDto;
}

TenderSchema.statics.serializeDetail = function (
  tender: TenderSerializable,
): TenderDetailDto {
  return serializeTender(tender);
};

TenderSchema.statics.serializeList = function (
  tender: TenderSerializable,
): TenderListDto {
  const {
    links,
    noticeVersion,
    titleProc,
    buyerIdentifier,
    buyerCity,
    buyerEmail,
    buyerInternetAddress,
    buyerProfile,
    dispatchDate,
    deadlineReceiptTender,
    duration,
    legalBasis,
    lots,
    submissionUrls,
    selectionCriteria,
    awardCriteria,
    ...rest
  } = serializeTender(tender);

  return rest;
};

export const TenderModel: TenderModelType =
  (mongoose.models.Tender as TenderModelType | undefined) ??
  mongoose.model<TenderDocument, TenderModelType>('Tender', TenderSchema);
