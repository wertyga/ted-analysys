import mongoose, { Document, Model, Schema } from 'mongoose';
import { validateTenderDeepCompanyFitResult } from '@/openai/schemas/deep-analysis';
import { TenderDeepAnalysisResult, TenderDeepRecommendation } from '@/types';
import { filterModel, isMongoId, isPopulatedRecord } from '@/utils';
import { TenderGeneralAnalysisModel } from '@/resources/tender-analysis/schemas';
import { UserModel } from '@/resources/user/user.schema';
import { UserDocument } from '@/resources/user/user.types';

export enum TenderDeepAnalysisStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export type DeepCompanyFitResultJson = TenderDeepAnalysisResult;

export interface TenderDeepAnalysis {
  tenderId: string;
  tender: mongoose.Types.ObjectId;
  company: mongoose.Types.ObjectId;
  generalAnalysis: mongoose.Types.ObjectId;
  status: TenderDeepAnalysisStatus;
  language: string;
  resultJson?: DeepCompanyFitResultJson;
  executiveSummary?: string;
  fitScore?: number;
  recommendation?: TenderDeepRecommendation;
  documentsAnalyzedCount?: number;
  missingDocumentsWarning?: boolean;
  sourceHash: string;
  promptVersion?: string;
  errorMessage?: string;
  analyzedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderDeepAnalysisDocument = TenderDeepAnalysis & Document;
export type TenderDeepAnalysisRecord = TenderDeepAnalysis & {
  _id: unknown;
  isOutOfDate?: boolean;
};

export interface TenderDeepAnalysisModelType extends Model<TenderDeepAnalysisDocument> {
  serializeDetail(
    doc?: TenderDeepAnalysisDocument | TenderDeepAnalysisRecord | null,
  ): Partial<TenderDeepAnalysisDocument> | null;
}

export const TenderDeepAnalysisSchema: Schema<
  TenderDeepAnalysisDocument,
  TenderDeepAnalysisModelType
> = new Schema<TenderDeepAnalysisDocument, TenderDeepAnalysisModelType>(
  {
    tenderId: { type: String, required: true },
    tender: { type: Schema.Types.ObjectId, ref: 'Tender', required: true },
    company: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    generalAnalysis: {
      type: Schema.Types.ObjectId,
      ref: 'TenderGeneralAnalysis',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TenderDeepAnalysisStatus),
      default: TenderDeepAnalysisStatus.PENDING,
    },
    language: { type: String, required: true },
    resultJson: {
      type: Schema.Types.Mixed,
      default: undefined,
      validate: {
        validator: (value: unknown) =>
          value === undefined ||
          validateTenderDeepCompanyFitResult(value).success,
        message: 'resultJson does not match the deep company-fit schema',
      },
    },
    executiveSummary: String,
    fitScore: { type: Number, min: 0, max: 100 },
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
    documentsAnalyzedCount: { type: Number, default: 0 },
    missingDocumentsWarning: { type: Boolean, default: false },
    sourceHash: { type: String, required: true, index: true },
    promptVersion: String,
    errorMessage: String,
    analyzedAt: Date,
  },
  { collection: 'tender_deep_analyses', timestamps: true },
);

TenderDeepAnalysisSchema.index({ status: 1, updatedAt: 1 });
TenderDeepAnalysisSchema.index({ company: 1, tenderId: 1 });

TenderDeepAnalysisSchema.statics.serializeDetail = function serializeDetail(
  analysis?: TenderDeepAnalysisDocument | null,
) {
  const generalAnalysis = isMongoId(analysis?.generalAnalysis)
    ? analysis?.generalAnalysis
    : TenderGeneralAnalysisModel.serializeDetail(analysis?.generalAnalysis);

  return analysis
    ? {
        ...filterModel(analysis, {
          excludeFields: ['sourceHash', 'promptVersion'],
        }),
        generalAnalysis,
        // Populated for the analysis itself; strip password hash, tokens etc.
        company: isPopulatedRecord(analysis.company)
          ? UserModel.serializeUser(
              analysis.company as unknown as UserDocument,
              true,
            )
          : analysis.company,
      }
    : null;
};

export const TenderDeepAnalysisModel: TenderDeepAnalysisModelType =
  (mongoose.models.TenderDeepAnalysis as
    | TenderDeepAnalysisModelType
    | undefined) ??
  mongoose.model<TenderDeepAnalysisDocument, TenderDeepAnalysisModelType>(
    'TenderDeepAnalysis',
    TenderDeepAnalysisSchema,
  );
