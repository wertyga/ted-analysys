import { TenderDeepAnalysisResult, TenderDeepRecommendation } from '@/types';
import mongoose, { Document, Model, Schema } from 'mongoose';
import { filterModel } from '@/utils';
import {
  TenderDetailDto,
  TenderListDto,
} from '@/resources/tenders/dto/tender.dto';
import {
  TenderDocument,
  TenderSerializable,
} from '@/resources/tenders/schemas';

export enum TenderDeepAnalysisStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export interface TenderDeepAnalysis {
  tenderId: string;
  tender: mongoose.Types.ObjectId;
  companyId: string;
  company: mongoose.Types.ObjectId;
  generalAnalysis?: mongoose.Types.ObjectId;
  status: TenderDeepAnalysisStatus;
  resultJson?: TenderDeepAnalysisResult;
  executiveSummary?: string;
  fitScore?: number;
  fitConfidenceScore?: number;
  participationReadinessScore?: number;
  documentationCompletenessScore?: number;
  requirementsClarityScore?: number;
  riskScore?: number;
  opportunityScore?: number;
  companyCapabilityScore?: number;
  eligibilityFitScore?: number;
  commercialFitScore?: number;
  deadlineFitScore?: number;
  recommendation?: TenderDeepRecommendation;
  analysisDepth: 'deep_company_fit';
  documentsAnalyzedCount?: number;
  documentsTotalCount?: number;
  missingDocumentsWarning?: boolean;
  sourceHash?: string;
  promptVersion?: string;
  model?: string;
  errorMessage?: string;
  analyzedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderDeepAnalysisDocument = TenderDeepAnalysis & Document;

export interface TenderDeepModelType extends Model<TenderDeepAnalysisDocument> {
  serializeDetail(tender: TenderDeepAnalysisDocument): TenderDeepAnalysis;
}

const TenderDeepAnalysisSchema = new Schema<TenderDeepAnalysisDocument>(
  {
    tenderId: { type: String, required: true },
    tender: {
      type: Schema.Types.ObjectId,
      ref: 'Tender',
      required: true,
    },
    companyId: { type: String, required: true },
    company: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    generalAnalysis: {
      type: Schema.Types.ObjectId,
      ref: 'TenderGeneralAnalysis',
      default: undefined,
    },
    status: {
      type: String,
      enum: Object.values(TenderDeepAnalysisStatus),
      default: TenderDeepAnalysisStatus.PENDING,
    },
    resultJson: { type: Schema.Types.Mixed, default: undefined },
    executiveSummary: String,
    fitScore: { type: Number, min: 0, max: 100 },
    fitConfidenceScore: { type: Number, min: 0, max: 100 },
    participationReadinessScore: { type: Number, min: 0, max: 100 },
    documentationCompletenessScore: { type: Number, min: 0, max: 100 },
    requirementsClarityScore: { type: Number, min: 0, max: 100 },
    riskScore: { type: Number, min: 0, max: 100 },
    opportunityScore: { type: Number, min: 0, max: 100 },
    companyCapabilityScore: { type: Number, min: 0, max: 100 },
    eligibilityFitScore: { type: Number, min: 0, max: 100 },
    commercialFitScore: { type: Number, min: 0, max: 100 },
    deadlineFitScore: { type: Number, min: 0, max: 100 },
    recommendation: {
      type: String,
      enum: [
        'strong_go',
        'go',
        'investigate',
        'caution',
        'no_go',
        'not_actionable',
      ],
    },
    analysisDepth: {
      type: String,
      enum: ['deep_company_fit'],
      default: 'deep_company_fit',
      required: true,
    },
    documentsAnalyzedCount: { type: Number, min: 0, default: 0 },
    documentsTotalCount: { type: Number, min: 0, default: 0 },
    missingDocumentsWarning: { type: Boolean, default: false },
    sourceHash: { type: String },
    promptVersion: String,
    errorMessage: String,
    analyzedAt: Date,
  },
  {
    collection: 'tender_deep_analyses',
    timestamps: true,
  },
);

TenderDeepAnalysisSchema.add({ model: String } as Record<string, unknown>);

TenderDeepAnalysisSchema.index({ tenderId: 1 });
TenderDeepAnalysisSchema.index({ tender: 1 });
TenderDeepAnalysisSchema.index({ companyId: 1 });
TenderDeepAnalysisSchema.index({ company: 1 });
TenderDeepAnalysisSchema.index({ tenderId: 1, companyId: 1 });
TenderDeepAnalysisSchema.index({ sourceHash: 1 });
TenderDeepAnalysisSchema.index({ status: 1 });
TenderDeepAnalysisSchema.index(
  { tenderId: 1, companyId: 1, sourceHash: 1 },
  { unique: true },
);

function serializeDeepAnalysis(analysis: TenderDeepAnalysisDocument) {
  return filterModel(analysis);
}

TenderDeepAnalysisSchema.statics.serializeDetail = serializeDeepAnalysis;

export const TenderDeepAnalysisModel: TenderDeepModelType =
  (mongoose.models.TenderDeepAnalysis as TenderDeepModelType | undefined) ??
  mongoose.model<TenderDeepAnalysisDocument, TenderDeepModelType>(
    'TenderDeepAnalysis',
    TenderDeepAnalysisSchema,
  );
