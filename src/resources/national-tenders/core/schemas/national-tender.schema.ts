import mongoose, { Document, Model, Schema } from 'mongoose';
import {
  TenderDurationSchema,
  TenderLot,
  TenderLotSchema,
  TenderShortTitle,
} from '@/resources/tenders/schemas';
import {
  NationalTenderAmendment,
  NationalTenderBuyer,
  NationalTenderChange,
  NationalTenderSource,
} from '@/resources/national-tenders/core/national-tender.types';

/**
 * Tender collected from a national (non-TED) portal.
 *
 * Kept in its own collection (`national_tenders`), permanently separate from
 * `tenders`: features that read TED tenders (search, buyers, sitemap, SEO,
 * x-posts, matching) opt in to national tenders explicitly. Field names mirror
 * `Tender` so they can be served as `TenderDto`.
 */
export interface NationalTender {
  _id: mongoose.Types.ObjectId;
  id: string;
  source: NationalTenderSource;
  sourceId: string;
  sourceProcedureId?: string;
  sourceNoticeType: string;
  sourceVersion?: string;
  sourceUrl?: string;
  country: string;
  isBelowEuThreshold?: boolean;
  noticeType: string;
  procedureType?: string;
  title?: string;
  shortTitle?: TenderShortTitle;
  description?: string;
  estimatedValue?: { amount: number | null; currency: string | null };
  estimatedValueEur?: number | null;
  noticeLanguage?: string;
  submissionLanguages: string[];
  publicationDate?: Date;
  submissionDeadline?: Date;
  duration?: TenderLot['duration'];
  contractNature?: string;
  legalBasis?: string;
  electronicSubmission?: string;
  mainClassificationProc: string[];
  cpvCodes: string[];
  placeOfPerformanceCountries: string[];
  placeOfPerformanceSubdivisions: string[];
  placeOfPerformanceCities: string[];
  lots: TenderLot[];
  documentUrls: string[];
  submissionUrls: string[];
  euFundLot?: boolean;
  buyers: NationalTenderBuyer[];
  /** Amendment notices applied on top of the original notice, oldest first. */
  amendments: NationalTenderAmendment[];
  /** Original source payload. Excluded from queries by default. */
  rawData?: unknown;
  /** Hash of normalized fields, used to skip unchanged notices. */
  sourceHash: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type NationalTenderDocument = NationalTender & Document;
export type NationalTenderModelType = Model<NationalTenderDocument>;

const NationalTenderBuyerSchema = new Schema<NationalTenderBuyer>(
  {
    name: { type: String, required: true },
    nationalId: String,
    registryId: String,
    sourceOrganizationId: String,
    street: String,
    city: String,
    postalCode: String,
    country: { type: String, required: true },
    nuts: String,
    email: String,
    website: String,
    legalType: String,
    mainActivity: String,
  },
  { _id: false },
);

const NationalTenderChangeSchema = new Schema<NationalTenderChange>(
  {
    field: { type: String, required: true },
    label: String,
    before: String,
    after: String,
  },
  { _id: false },
);

const NationalTenderAmendmentSchema = new Schema<NationalTenderAmendment>(
  {
    sourceId: { type: String, required: true },
    publicationDate: Date,
    changes: { type: [NationalTenderChangeSchema], default: [] },
    patch: {
      submissionDeadline: Date,
    },
  },
  { _id: false },
);

const NationalTenderSchema = new Schema<NationalTenderDocument>(
  {
    id: { type: String, required: true, unique: true },
    source: {
      type: String,
      enum: Object.values(NationalTenderSource),
      required: true,
    },
    sourceId: { type: String, required: true },
    sourceProcedureId: String,
    sourceNoticeType: { type: String, required: true },
    sourceVersion: String,
    sourceUrl: String,
    country: { type: String, required: true },
    isBelowEuThreshold: Boolean,
    noticeType: { type: String, required: true },
    procedureType: String,
    title: String,
    shortTitle: {
      en: String,
      de: String,
      fr: String,
      pl: String,
      ru: String,
    },
    description: String,
    estimatedValue: {
      amount: { type: Number, default: null },
      currency: { type: String, default: null },
    },
    estimatedValueEur: { type: Number, default: null },
    noticeLanguage: String,
    submissionLanguages: { type: [String], default: [] },
    publicationDate: Date,
    submissionDeadline: Date,
    duration: { type: TenderDurationSchema },
    contractNature: String,
    legalBasis: String,
    electronicSubmission: String,
    mainClassificationProc: { type: [String], default: [] },
    cpvCodes: { type: [String], default: [] },
    placeOfPerformanceCountries: { type: [String], default: [] },
    placeOfPerformanceSubdivisions: { type: [String], default: [] },
    placeOfPerformanceCities: { type: [String], default: [] },
    lots: { type: [TenderLotSchema], default: [] },
    documentUrls: { type: [String], default: [] },
    submissionUrls: { type: [String], default: [] },
    euFundLot: Boolean,
    buyers: { type: [NationalTenderBuyerSchema], default: [] },
    amendments: { type: [NationalTenderAmendmentSchema], default: [] },
    rawData: { type: Schema.Types.Mixed, select: false },
    sourceHash: { type: String, required: true },
  },
  {
    collection: 'national_tenders',
    timestamps: true,
  },
);

NationalTenderSchema.index(
  { source: 1, sourceId: 1 },
  { name: 'idx_source_source_id', unique: true },
);
NationalTenderSchema.index(
  { source: 1, sourceProcedureId: 1 },
  { name: 'idx_source_procedure' },
);
NationalTenderSchema.index(
  { source: 1, publicationDate: -1 },
  { name: 'idx_source_pubdate' },
);
NationalTenderSchema.index(
  { country: 1, submissionDeadline: 1 },
  { name: 'idx_country_deadline' },
);
NationalTenderSchema.index({ cpvCodes: 1 }, { name: 'idx_cpv' });
NationalTenderSchema.index(
  { source: 1, 'amendments.publicationDate': -1 },
  { name: 'idx_source_amendment_pubdate' },
);

export const NationalTenderModel: NationalTenderModelType =
  (mongoose.models.NationalTender as NationalTenderModelType | undefined) ??
  mongoose.model<NationalTenderDocument>(
    'NationalTender',
    NationalTenderSchema,
  );
