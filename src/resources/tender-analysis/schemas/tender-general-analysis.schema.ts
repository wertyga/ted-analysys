import mongoose, { Document, Model, Schema } from 'mongoose';

export enum TenderGeneralAnalysisStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export enum TenderGeneralRecommendation {
  PROMISING = 'PROMISING',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  NOT_RECOMMENDED = 'NOT_RECOMMENDED',
}

export enum TenderAnalysisDepth {
  STRUCTURED_NOTICE_ONLY = 'STRUCTURED_NOTICE_ONLY',
  NOTICE_WITH_DOCUMENTS = 'NOTICE_WITH_DOCUMENTS',
  FULL_DOCUMENTS = 'FULL_DOCUMENTS',
}

export enum EstimatedValueSource {
  STRUCTURED_DATA = 'STRUCTURED_DATA',
  XML_NOTICE = 'XML_NOTICE',
  DOCUMENT_TEXT = 'DOCUMENT_TEXT',
  NOT_FOUND = 'NOT_FOUND',
}

export interface TenderEstimatedValue {
  amount: number | null;
  currency: string | null;
  description: string | null;
  source: EstimatedValueSource;
}

export interface TenderGeneralAnalysis {
  /**
   * Business tender id, e.g. "ted-756265-2023".
   */
  tenderId: string;

  /**
   * Mongo ObjectId reference to Tender document.
   */
  tender: mongoose.Types.ObjectId;

  status: TenderGeneralAnalysisStatus;

  resultJson?: unknown;
  summary?: string;

  estimatedValue?: TenderEstimatedValue;

  complexityScore?: number;
  opportunityScore?: number;
  generalRecommendation?: TenderGeneralRecommendation;
  confidenceScore?: number;

  analysisDepth?: TenderAnalysisDepth;
  documentsAnalyzedCount?: number;
  missingDocumentsWarning?: boolean;

  sourceHash?: string;
  promptVersion?: string;
  model?: string;
  errorMessage?: string;
  analyzedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderGeneralAnalysisDocument = TenderGeneralAnalysis & Document;

const EstimatedValueSchema = new Schema<TenderEstimatedValue>(
  {
    amount: { type: Number, default: null },
    currency: { type: String, default: null },
    description: { type: String, default: null },
    source: {
      type: String,
      enum: Object.values(EstimatedValueSource),
      required: true,
    },
  },
  { _id: false },
);

const TenderGeneralAnalysisSchema = new Schema<TenderGeneralAnalysisDocument>(
  {
    tenderId: {
      type: String,
      required: true,
    },

    tender: {
      type: Schema.Types.ObjectId,
      ref: 'Tender',
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(TenderGeneralAnalysisStatus),
      default: TenderGeneralAnalysisStatus.PENDING,
    },

    resultJson: { type: Schema.Types.Mixed, default: undefined },

    summary: String,

    estimatedValue: {
      type: EstimatedValueSchema,
      default: undefined,
    },

    complexityScore: {
      type: Number,
      min: 0,
      max: 100,
    },

    opportunityScore: {
      type: Number,
      min: 0,
      max: 100,
    },

    generalRecommendation: {
      type: String,
      enum: Object.values(TenderGeneralRecommendation),
    },

    confidenceScore: {
      type: Number,
      min: 0,
      max: 100,
    },

    analysisDepth: {
      type: String,
      enum: Object.values(TenderAnalysisDepth),
    },

    documentsAnalyzedCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    missingDocumentsWarning: {
      type: Boolean,
      default: false,
    },

    sourceHash: {
      type: String,
    },

    promptVersion: String,
    errorMessage: String,
  },
  {
    collection: 'tender_general_analyses',
    timestamps: true,
  },
);

TenderGeneralAnalysisSchema.index({ tender: 1 }, { unique: true });
TenderGeneralAnalysisSchema.index({ tenderId: 1 }, { unique: true });
TenderGeneralAnalysisSchema.index({ status: 1, updatedAt: 1 });
TenderGeneralAnalysisSchema.index({ generalRecommendation: 1 });
TenderGeneralAnalysisSchema.index({ opportunityScore: -1 });
TenderGeneralAnalysisSchema.index({ complexityScore: -1 });
TenderGeneralAnalysisSchema.index({ analysisDepth: 1 });
TenderGeneralAnalysisSchema.index({ missingDocumentsWarning: 1 });

export const TenderGeneralAnalysisModel: Model<TenderGeneralAnalysisDocument> =
  (mongoose.models.TenderGeneralAnalysis as
    | Model<TenderGeneralAnalysisDocument>
    | undefined) ??
  mongoose.model<TenderGeneralAnalysisDocument>(
    'TenderGeneralAnalysis',
    TenderGeneralAnalysisSchema,
  );
