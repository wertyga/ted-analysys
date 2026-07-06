import mongoose, { Document, Model, Schema } from 'mongoose';
import type {
  TenderGeneralAnalysisDetailDto,
  TenderGeneralAnalysisListDto,
} from '../dto/tender-general-analysis.dto';
import { filterModel } from '@/utils';

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

  status: TenderGeneralAnalysisStatus;

  resultJson?: any;
  summary?: string;

  complexityScore?: number;
  opportunityScore?: number;
  generalRecommendation?: TenderGeneralRecommendation;
  confidenceScore?: number;

  analysisDepth?: TenderAnalysisDepth;
  documentsAnalyzedCount?: number;
  missingDocumentsWarning?: boolean;

  sourceHash: string;
  promptVersion?: string;
  model?: string;
  errorMessage?: string;
  analyzedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderGeneralAnalysisDocument = TenderGeneralAnalysis & Document;
export type TenderGeneralAnalysisRecord = TenderGeneralAnalysis & {
  _id?: unknown;
};

export type TenderGeneralAnalysisSerializable =
  | TenderGeneralAnalysisDocument
  | TenderGeneralAnalysisRecord;
type TenderGeneralAnalysisLegacySerializable =
  TenderGeneralAnalysisSerializable & {
    tender?: unknown;
  };

export interface TenderGeneralAnalysisModelType extends Model<TenderGeneralAnalysisDocument> {
  serializeList(
    analysis?: TenderGeneralAnalysisSerializable | null,
  ): TenderGeneralAnalysisListDto | null;
  serializeDetail(
    analysis?: TenderGeneralAnalysisSerializable | null,
  ): TenderGeneralAnalysisDetailDto | null;
}

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

const TenderGeneralAnalysisSchema = new Schema<
  TenderGeneralAnalysisDocument,
  TenderGeneralAnalysisModelType
>(
  {
    tenderId: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(TenderGeneralAnalysisStatus),
      default: TenderGeneralAnalysisStatus.PENDING,
    },

    resultJson: { type: Schema.Types.Mixed, default: undefined },

    summary: String,

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

TenderGeneralAnalysisSchema.add({ model: String } as Record<string, unknown>);

TenderGeneralAnalysisSchema.index({ tenderId: 1 }, { unique: true });
TenderGeneralAnalysisSchema.index({ status: 1, updatedAt: 1 });
TenderGeneralAnalysisSchema.index({ generalRecommendation: 1 });
TenderGeneralAnalysisSchema.index({ opportunityScore: -1 });
TenderGeneralAnalysisSchema.index({ complexityScore: -1 });
TenderGeneralAnalysisSchema.index({ analysisDepth: 1 });
TenderGeneralAnalysisSchema.index({ missingDocumentsWarning: 1 });

function serializeGeneralAnalysisList(
  analysis?: TenderGeneralAnalysisSerializable | null,
): TenderGeneralAnalysisListDto | null {
  if (!analysis) {
    return null;
  }

  return filterModel(analysis, {
    includeFields: [
      'status',
      'summary',
      'confidenceScore',
      'opportunityScore',
      'generalRecommendation',
      'complexityScore',
      'updatedAt',
    ],
  });
}

function serializeGeneralAnalysisDetail(
  analysis?: TenderGeneralAnalysisSerializable | null,
): TenderGeneralAnalysisDetailDto | null {
  if (!analysis) {
    return null;
  }

  return filterModel(analysis as TenderGeneralAnalysisLegacySerializable, {
    excludeFields: ['sourceHash', 'promptVersion', 'model', 'tender'],
  });
}

TenderGeneralAnalysisSchema.statics.serializeList =
  serializeGeneralAnalysisList;
TenderGeneralAnalysisSchema.statics.serializeDetail =
  serializeGeneralAnalysisDetail;

export const TenderGeneralAnalysisModel: TenderGeneralAnalysisModelType =
  (mongoose.models.TenderGeneralAnalysis as
    | TenderGeneralAnalysisModelType
    | undefined) ??
  mongoose.model<TenderGeneralAnalysisDocument, TenderGeneralAnalysisModelType>(
    'TenderGeneralAnalysis',
    TenderGeneralAnalysisSchema,
  );
