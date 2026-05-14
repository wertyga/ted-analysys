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

export interface Tender {
  _id: string;
  /** Local canonical id. For TED tenders this is the publication number. */
  id: string;
  /** Source system name. Currently always TED. */
  source: string;
  /** TED/eForms notice-identifier: unique notice id in the source system. */
  sourceNoticeId?: string;
  /** TED/OJ publication number, e.g. 756265-2023. Useful for display and manual search. */
  publicationNumber?: string;
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
  /** TED title-proc: title at procedure level. */
  titleProc?: string;
  /** TED title-lot: titles of individual lots. */
  titleLot?: string[];
  /** TED description-proc, with lot description fallback when procedure description is absent. */
  description?: string;
  /** TED description-lot: descriptions of individual lots, useful for matching and AI analysis. */
  descriptionLot?: string[];
  /** Estimated value selected from procedure value first, then lot value fallback. */
  estimatedValue?: {
    amount: number | null;
    currency: string | null;
  };
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
  /** TED duration-period-value-lot: numeric contract duration value when dates are not enough. */
  durationPeriodValue?: string;
  /** TED duration-period-unit-lot: duration unit such as day, month, or year. */
  durationPeriodUnit?: string;
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
  /** Mongo ObjectId references to CpvCategory documents from TED main-classification-proc. */
  mainClassificationProc?: unknown[];
  /** Mongo ObjectId references to CpvCategory documents from TED main-classification-lot. */
  mainClassificationLot?: unknown[];
  /** Mongo ObjectId references to CpvCategory documents from TED additional-classification-lot. */
  additionalClassificationLot?: unknown[];
  /** TED place-of-performance-country-* fields: countries where the contract is performed. */
  placeOfPerformanceCountries?: string[];
  /** TED place-of-performance-city-* fields: cities where the contract is performed. */
  placeOfPerformanceCities?: string[];
  /** TED identifier-lot: technical lot ids inside the notice, e.g. LOT-0001. */
  lotIdentifiers?: string[];
  /** TED internal-identifier-lot: stable lot references across notices/stages. */
  internalLotIdentifiers?: string[];
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
  /** Mongo ObjectId references to CpvCategory documents resolved from cpvCodes. */
  classificationCpv?: unknown[];
  /** Aggregated raw CPV code strings from classification/main/additional CPV fields. */
  cpvCodes?: unknown[];
  /** Raw TED links object, including notice/XML/HTML/document links when returned. */
  links?: TenderDocumentsLinks;
  /** Cached TED XML notice content, used internally to avoid repeated XML downloads. */
  xmlContent?: string;
  /** Full raw TED notice payload as returned by TED before local normalization. */
  rawData?: unknown;
  /** Hash of the normalized tender source fields used to detect tender changes. */
  sourceHash: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderDocument = Tender & Document;
export type TenderRecord = Tender & { _id: unknown; rawData?: unknown };
export type TenderSerializable = TenderDocument | TenderRecord;

export const TENDER_XML_CACHE_SELECT = '+xmlContent';

export interface TenderModelType extends Model<TenderDocument> {
  serializeDetail(tender: TenderSerializable): TenderDetailDto;
  serializeList(tender: TenderSerializable): TenderListDto;
}

export type TenderWithWishlist = Tender & {
  isInWishlist: boolean;
};

const TenderSchema = new Schema<TenderDocument, TenderModelType>(
  {
    id: { type: String, required: true, unique: true, index: true },
    source: { type: String, required: true, index: true },
    sourceNoticeId: { type: String, index: true },
    publicationNumber: { type: String, index: true },
    noticeType: String,
    noticeSubtype: String,
    noticeVersion: String,
    procedureType: String,
    title: String,
    titleProc: String,
    titleLot: { type: [String], default: undefined },
    description: String,
    descriptionLot: { type: [String], default: undefined },
    estimatedValue: {
      amount: { type: Number, default: null },
      currency: { type: String, default: null },
    },
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
    durationPeriodValue: String,
    durationPeriodUnit: String,
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
    mainClassificationProc: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      default: [],
    },
    mainClassificationLot: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      default: [],
    },
    additionalClassificationLot: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      default: [],
    },
    placeOfPerformanceCountries: { type: [String], default: undefined },
    placeOfPerformanceCities: { type: [String], default: undefined },
    lotIdentifiers: { type: [String], default: undefined },
    internalLotIdentifiers: { type: [String], default: undefined },
    documentUrls: { type: [String], default: undefined },
    submissionUrls: { type: [String], default: undefined },
    euFundLot: {
      type: Boolean,
      default: undefined,
      index: true,
    },
    selectionCriteria: { type: [Schema.Types.Mixed], default: undefined },
    awardCriteria: { type: [Schema.Types.Mixed], default: undefined },
    classificationCpv: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      required: true,
      default: [],
    },
    cpvCodes: { type: [Schema.Types.Mixed], default: undefined },
    links: Schema.Types.Mixed,
    xmlContent: { type: String, select: false },
    rawData: { type: Schema.Types.Mixed, select: false },
    sourceHash: { type: String, required: true, index: true },
  },
  {
    collection: 'tenders',
    timestamps: true,
  },
);

function serializeTender(tender: TenderSerializable): TenderDto {
  return filterModel(tender as TenderDocument, {
    excludeFields: [
      'source',
      'cpvCodes',
      'rawData',
      'links',
      'xmlContent',
      'sourceHash',
    ],
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
    sourceNoticeId,
    noticeVersion,
    titleProc,
    titleLot,
    descriptionLot,
    buyerIdentifier,
    buyerCity,
    buyerEmail,
    buyerInternetAddress,
    buyerProfile,
    dispatchDate,
    deadlineReceiptTender,
    durationPeriodValue,
    durationPeriodUnit,
    legalBasis,
    additionalClassificationLot,
    lotIdentifiers,
    internalLotIdentifiers,
    submissionUrls,
    selectionCriteria,
    awardCriteria,
    cpvCodes,
    source,
    ...rest
  } = serializeTender(tender);

  return rest;
};

export const TenderModel: TenderModelType =
  (mongoose.models.Tender as TenderModelType | undefined) ??
  mongoose.model<TenderDocument, TenderModelType>('Tender', TenderSchema);
