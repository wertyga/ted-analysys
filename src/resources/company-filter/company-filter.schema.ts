import mongoose, { Document, Model, Schema } from 'mongoose';
import { CurrencySign, Language } from '@/resources/codelist';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';

export enum CompanyTenderFilterCpvSource {
  INDUSTRY = 'industry',
  MAIN_SERVICE = 'main_service',
  AI_SUGGESTION = 'ai_suggestion',
  USER = 'user',
}

export enum CompanyTenderFilterCpvMatchLevel {
  BROAD = 'broad',
  MEDIUM = 'medium',
  SPECIFIC = 'specific',
}

export enum CompanyTenderFilterGenerationStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface CompanyTenderFilterCpvCode {
  category?: mongoose.Types.ObjectId | null;
  code: string;
  label?: string;
  source: CompanyTenderFilterCpvSource;
  matchLevel: CompanyTenderFilterCpvMatchLevel;
  confidence: number;
  reason?: string;
}

export interface CompanyTenderFilter {
  user: mongoose.Types.ObjectId;
  summary?: string;
  cpvCodes: CompanyTenderFilterCpvCode[];
  targetCountries: string[];
  excludedCountries: string[];
  languages: Language[];
  contractNatures: TedContractNature[];
  minBudget?: number | null;
  maxBudget?: number | null;
  currency?: CurrencySign | null;
  allowUnknownBudget: boolean;
  minDaysBeforeDeadline: number;
  requiredKeywords: string[];
  optionalKeywords: string[];
  excludedKeywords: string[];
  certifications: string[];
  capabilities: string[];
  publicProcurementExperience?: boolean | null;
  notificationThreshold: number;
  confirmedByUser: boolean;
  generationStatus: CompanyTenderFilterGenerationStatus;
  generationStartedAt?: Date | null;
  generationFinishedAt?: Date | null;
  generationError?: string | null;
  extractionWarnings: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type CompanyTenderFilterDocument = CompanyTenderFilter & Document;

const CompanyTenderFilterCpvCodeSchema = new Schema<CompanyTenderFilterCpvCode>(
  {
    category: {
      type: Schema.Types.ObjectId,
      ref: 'CpvCategory',
      default: null,
    },
    code: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      default: '',
    },
    source: {
      type: String,
      enum: Object.values(CompanyTenderFilterCpvSource),
      required: true,
    },
    matchLevel: {
      type: String,
      enum: Object.values(CompanyTenderFilterCpvMatchLevel),
      default: CompanyTenderFilterCpvMatchLevel.MEDIUM,
    },
    confidence: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    reason: {
      type: String,
      default: '',
    },
  },
  { _id: false },
);

export const CompanyTenderFilterSchema =
  new Schema<CompanyTenderFilterDocument>(
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
        unique: true,
      },
      summary: {
        type: String,
        default: '',
      },
      cpvCodes: {
        type: [CompanyTenderFilterCpvCodeSchema],
        default: [],
      },
      targetCountries: {
        type: [String],
        default: [],
      },
      excludedCountries: {
        type: [String],
        default: [],
      },
      languages: {
        type: [String],
        enum: Object.values(Language),
        default: [],
      },
      contractNatures: {
        type: [String],
        enum: Object.values(TedContractNature),
        default: [],
      },
      minBudget: {
        type: Number,
        default: null,
      },
      maxBudget: {
        type: Number,
        default: null,
      },
      currency: {
        type: String,
        enum: [...Object.values(CurrencySign), null],
        default: null,
      },
      allowUnknownBudget: {
        type: Boolean,
        default: true,
      },
      minDaysBeforeDeadline: {
        type: Number,
        default: 7,
        min: 0,
      },
      requiredKeywords: {
        type: [String],
        default: [],
      },
      optionalKeywords: {
        type: [String],
        default: [],
      },
      excludedKeywords: {
        type: [String],
        default: [],
      },
      certifications: {
        type: [String],
        default: [],
      },
      capabilities: {
        type: [String],
        default: [],
      },
      publicProcurementExperience: {
        type: Boolean,
        default: null,
      },
      notificationThreshold: {
        type: Number,
        default: 65,
        min: 0,
        max: 100,
      },
      confirmedByUser: {
        type: Boolean,
        default: false,
      },
      generationStatus: {
        type: String,
        enum: Object.values(CompanyTenderFilterGenerationStatus),
        default: CompanyTenderFilterGenerationStatus.NOT_STARTED,
        index: true,
      },
      generationStartedAt: {
        type: Date,
        default: null,
      },
      generationFinishedAt: {
        type: Date,
        default: null,
      },
      generationError: {
        type: String,
        default: null,
      },
      extractionWarnings: {
        type: [String],
        default: [],
      },
    },
    {
      collection: 'company_tender_filters',
      timestamps: true,
    },
  );

export const CompanyTenderFilterModel: Model<CompanyTenderFilterDocument> =
  (mongoose.models.CompanyTenderFilter as
    | Model<CompanyTenderFilterDocument>
    | undefined) ??
  mongoose.model<CompanyTenderFilterDocument>(
    'CompanyTenderFilter',
    CompanyTenderFilterSchema,
  );
