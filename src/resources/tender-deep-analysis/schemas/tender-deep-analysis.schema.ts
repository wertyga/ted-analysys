import { TenderDeepAnalysisResult, TenderDeepRecommendation } from '@/types';
import mongoose, { Document, Model, Schema } from 'mongoose';
import { filterModel, isPopulatedRecord } from '@/utils';
import {
  TenderDetailDto,
  TenderListDto,
} from '@/resources/tenders/dto/tender.dto';
import {
  TenderDocument,
  TenderModel,
  TenderRecord,
  TenderSerializable,
} from '@/resources/tenders/schemas';
import { UserModel } from '@/resources/user/user.schema';
import { UserDocument } from '@/resources/user/user.types';
import {
  TenderGeneralAnalysisDocument,
  TenderGeneralAnalysisModel,
  TenderGeneralAnalysisRecord,
  TenderGeneralAnalysisSerializable,
} from '@/resources/tender-analysis/schemas';
import { normalizeResultJsonScoreBreakdown } from '../tender-deep-analysis.normalizer';

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
  company: mongoose.Types.ObjectId;
  generalAnalysis?: mongoose.Types.ObjectId;
  language: string;
  status: TenderDeepAnalysisStatus;
  resultJson?: TenderDeepAnalysisResult;
  executiveSummary?: string;
  fitScore?: number;
  fitConfidenceScore?: number;
  participationReadinessScore?: number;
  documentationCompletenessScore?: number;
  requirementsClarityScore?: number;
  riskScore?: number;
  riskLevelScore?: number;
  riskFitScore?: number;
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
  isOutOfDate?: boolean;
  sourceHash?: string;
  promptVersion?: string;
  model?: string;
  errorMessage?: string;
  analyzedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderDeepAnalysisDocument = TenderDeepAnalysis & Document;
export type TenderDeepAnalysisRecord = TenderDeepAnalysis & {
  _id?: unknown;
  tender?: mongoose.Types.ObjectId | TenderRecord | TenderDocument;
  company?: mongoose.Types.ObjectId | UserDocument;
  generalAnalysis?:
    | mongoose.Types.ObjectId
    | TenderGeneralAnalysisRecord
    | TenderGeneralAnalysisDocument;
};
export type TenderDeepAnalysisSerializable =
  | TenderDeepAnalysisDocument
  | TenderDeepAnalysisRecord;

export type TenderDeepAnalysisDetailDto = Omit<
  TenderDeepAnalysisRecord,
  'tender' | 'company' | 'generalAnalysis'
> & {
  tender?: TenderDetailDto | null;
  company?: ReturnType<typeof UserModel.serializeUser> | null;
  generalAnalysis?: ReturnType<
    typeof TenderGeneralAnalysisModel.serializeDetail
  >;
};

export type TenderDeepAnalysisListDto = Omit<
  TenderDeepAnalysisRecord,
  'tender' | 'company' | 'generalAnalysis'
> & {
  tender?: TenderListDto | null;
  company?: ReturnType<typeof UserModel.serializeUser> | null;
  generalAnalysis?: ReturnType<typeof TenderGeneralAnalysisModel.serializeList>;
};

export interface TenderDeepModelType extends Model<TenderDeepAnalysisDocument> {
  serializeDetail(
    analysis?: TenderDeepAnalysisSerializable | null,
  ): TenderDeepAnalysisDetailDto | null;
  serializeList(
    analysis?: TenderDeepAnalysisSerializable | null,
  ): TenderDeepAnalysisListDto | null;
}

const TenderDeepAnalysisSchema = new Schema<TenderDeepAnalysisDocument>(
  {
    tenderId: { type: String, required: true },
    tender: {
      type: Schema.Types.ObjectId,
      ref: 'Tender',
      required: true,
    },
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
    language: { type: String, required: true, default: 'en', trim: true },
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
    riskLevelScore: { type: Number, min: 0, max: 100 },
    riskFitScore: { type: Number, min: 0, max: 100 },
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
    isOutOfDate: { type: Boolean, default: false },
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
TenderDeepAnalysisSchema.index({ company: 1 });
TenderDeepAnalysisSchema.index({ language: 1 });
TenderDeepAnalysisSchema.index({ sourceHash: 1 });
TenderDeepAnalysisSchema.index({ status: 1 });
TenderDeepAnalysisSchema.index({ tenderId: 1, company: 1 });
TenderDeepAnalysisSchema.index({ tenderId: 1, company: 1, language: 1 });
TenderDeepAnalysisSchema.index(
  { tenderId: 1, company: 1, sourceHash: 1 },
  { unique: true },
);

function serializeDeepAnalysisDetail(
  analysis?: TenderDeepAnalysisSerializable | null,
): TenderDeepAnalysisDetailDto | null {
  if (!analysis) {
    return null;
  }

  const { tender, company, generalAnalysis, model, sourceHash, ...rest } =
    filterModel(
      analysis as TenderDeepAnalysisDocument,
    ) as TenderDeepAnalysisRecord;
  const normalizedRest = normalizeSerializedDeepAnalysis(rest);

  return {
    ...normalizedRest,
    tender: isPopulatedRecord(tender)
      ? TenderModel.serializeDetail(tender as TenderSerializable)
      : null,
    company: isPopulatedRecord(company)
      ? UserModel.serializeUser(company as UserDocument, 'true')
      : null,
    generalAnalysis: isPopulatedRecord(generalAnalysis)
      ? TenderGeneralAnalysisModel.serializeDetail(
          generalAnalysis as TenderGeneralAnalysisSerializable,
        )
      : null,
  };
}

function serializeDeepAnalysisList(
  analysis?: TenderDeepAnalysisSerializable | null,
): TenderDeepAnalysisListDto | null {
  if (!analysis) {
    return null;
  }

  const { tender, company, generalAnalysis, promptVersion, model, ...rest } =
    filterModel(
      analysis as TenderDeepAnalysisDocument,
    ) as TenderDeepAnalysisRecord;
  const normalizedRest = normalizeSerializedDeepAnalysis(rest);

  return {
    ...normalizedRest,
    tender: isPopulatedRecord(tender)
      ? TenderModel.serializeList(tender as TenderSerializable)
      : null,
    company: isPopulatedRecord(company)
      ? UserModel.serializeUser(company as UserDocument, 'true')
      : null,
    generalAnalysis: isPopulatedRecord(generalAnalysis)
      ? TenderGeneralAnalysisModel.serializeList(
          generalAnalysis as TenderGeneralAnalysisSerializable,
        )
      : null,
  };
}

function normalizeSerializedDeepAnalysis<
  T extends Partial<TenderDeepAnalysisRecord>,
>(analysis: T): T {
  if (!analysis.resultJson) {
    return analysis;
  }

  const resultJson = normalizeResultJsonScoreBreakdown(analysis.resultJson);
  const scores = resultJson.scores;

  return {
    ...analysis,
    resultJson,
    fitScore: scores.fitScore ?? analysis.fitScore,
    fitConfidenceScore:
      scores.fitConfidenceScore ?? analysis.fitConfidenceScore,
    participationReadinessScore:
      scores.participationReadinessScore ??
      analysis.participationReadinessScore,
    documentationCompletenessScore:
      scores.documentationCompletenessScore ??
      analysis.documentationCompletenessScore,
    requirementsClarityScore:
      scores.requirementsClarityScore ?? analysis.requirementsClarityScore,
    riskScore: scores.riskLevelScore ?? scores.riskScore ?? analysis.riskScore,
    riskLevelScore: scores.riskLevelScore ?? analysis.riskLevelScore,
    riskFitScore: scores.riskFitScore ?? analysis.riskFitScore,
    opportunityScore: scores.opportunityScore ?? analysis.opportunityScore,
    companyCapabilityScore:
      scores.companyCapabilityScore ?? analysis.companyCapabilityScore,
    eligibilityFitScore:
      scores.eligibilityFitScore ?? analysis.eligibilityFitScore,
    commercialFitScore:
      scores.commercialFitScore ?? analysis.commercialFitScore,
    deadlineFitScore: scores.deadlineFitScore ?? analysis.deadlineFitScore,
    missingDocumentsWarning:
      resultJson.documentationAnalysis?.missingDocumentsWarning ??
      analysis.missingDocumentsWarning,
  };
}

TenderDeepAnalysisSchema.statics.serializeDetail = serializeDeepAnalysisDetail;
TenderDeepAnalysisSchema.statics.serializeList = serializeDeepAnalysisList;

export const TenderDeepAnalysisModel: TenderDeepModelType =
  (mongoose.models.TenderDeepAnalysis as TenderDeepModelType | undefined) ??
  mongoose.model<TenderDeepAnalysisDocument, TenderDeepModelType>(
    'TenderDeepAnalysis',
    TenderDeepAnalysisSchema,
  );
