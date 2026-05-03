import mongoose, { Document, Model, Schema } from 'mongoose';

export interface Tender {
  id: string;
  source: string;
  sourceNoticeId?: string;
  publicationNumber?: string;
  noticeType?: string;
  procedureType?: string;
  title?: string;
  description?: string;
  estimatedValue?: {
    amount: number | null;
    currency: string | null;
  };
  noticeLanguage?: string;
  submissionLanguages?: string[];
  buyerName?: string;
  buyerCountry?: string;
  publicationDate?: string;
  submissionDeadline?: string;
  questionsDeadline?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  contractNature?: string;
  isDps?: boolean;
  isFrameworkAgreement?: boolean;
  isSmeSuitable?: boolean;
  electronicSubmission?: string;
  classificationCpv?: unknown[];
  cpvCodes?: unknown[];
  links?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderDocument = Tender & Document;

const TenderSchema = new Schema<TenderDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    source: { type: String, required: true, index: true },
    sourceNoticeId: { type: String, index: true },
    publicationNumber: { type: String, index: true },
    noticeType: String,
    procedureType: String,
    title: String,
    description: String,
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
    buyerCountry: String,
    publicationDate: String,
    submissionDeadline: String,
    questionsDeadline: String,
    plannedStartDate: String,
    plannedEndDate: String,
    contractNature: String,
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
    classificationCpv: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      required: true,
      default: [],
    },
    cpvCodes: { type: [Schema.Types.Mixed], default: undefined },
    links: Schema.Types.Mixed,
  },
  {
    collection: 'tenders',
    timestamps: true,
  },
);

export const TenderModel: Model<TenderDocument> =
  (mongoose.models.Tender as Model<TenderDocument> | undefined) ??
  mongoose.model<TenderDocument>('Tender', TenderSchema);
