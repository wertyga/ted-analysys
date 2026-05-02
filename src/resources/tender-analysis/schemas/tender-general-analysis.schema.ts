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

export interface TenderGeneralAnalysis {
  tender: mongoose.Types.ObjectId;
  status: TenderGeneralAnalysisStatus;
  resultJson?: unknown;
  summary?: string;
  complexityScore?: number;
  opportunityScore?: number;
  generalRecommendation?: TenderGeneralRecommendation;
  confidenceScore?: number;
  sourceHash?: string;
  promptVersion?: string;
  model?: string;
  errorMessage?: string;
  analyzedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderGeneralAnalysisDocument = TenderGeneralAnalysis & Document;

const TenderGeneralAnalysisSchema = new Schema(
  {
    tender: {
      type: Schema.Types.ObjectId,
      ref: 'Tender',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TenderGeneralAnalysisStatus),
      default: TenderGeneralAnalysisStatus.PENDING,
      index: true,
    },
    resultJson: { type: Schema.Types.Mixed, default: undefined },
    summary: String,
    complexityScore: { type: Number, min: 0, max: 100, index: true },
    opportunityScore: { type: Number, min: 0, max: 100, index: true },
    generalRecommendation: {
      type: String,
      enum: Object.values(TenderGeneralRecommendation),
      index: true,
    },
    confidenceScore: { type: Number, min: 0, max: 100 },
    sourceHash: { type: String, index: true },
    promptVersion: String,
    model: String,
    errorMessage: String,
    analyzedAt: Date,
  },
  {
    collection: 'tender_general_analyses',
    timestamps: true,
  },
);

TenderGeneralAnalysisSchema.index({ tender: 1 }, { unique: true });
TenderGeneralAnalysisSchema.index({ status: 1, updatedAt: 1 });
TenderGeneralAnalysisSchema.index({ generalRecommendation: 1 });
TenderGeneralAnalysisSchema.index({ opportunityScore: -1 });
TenderGeneralAnalysisSchema.index({ complexityScore: -1 });

export const TenderGeneralAnalysisModel: Model<TenderGeneralAnalysisDocument> =
  (mongoose.models.TenderGeneralAnalysis as
    | Model<TenderGeneralAnalysisDocument>
    | undefined) ??
  mongoose.model<TenderGeneralAnalysisDocument>(
    'TenderGeneralAnalysis',
    TenderGeneralAnalysisSchema,
  );
