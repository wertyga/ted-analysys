import mongoose, { Document, Model, Schema } from 'mongoose';

export enum CompanyProfileDocumentAnalysisStatus {
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  FAILED = 'FAILED',
  SUPERSEDED = 'SUPERSEDED',
}

export enum CompanyProfileDocumentType {
  COMPANY_PROFILE = 'COMPANY_PROFILE',
  CAPABILITY_STATEMENT = 'CAPABILITY_STATEMENT',
  REFERENCE_PROJECT = 'REFERENCE_PROJECT',
  CASE_STUDY = 'CASE_STUDY',
  CERTIFICATE = 'CERTIFICATE',
  FINANCIAL_STATEMENT = 'FINANCIAL_STATEMENT',
  TECHNICAL_BROCHURE = 'TECHNICAL_BROCHURE',
  CV_OR_TEAM_PROFILE = 'CV_OR_TEAM_PROFILE',
  POLICY = 'POLICY',
  CONTRACT_OR_PURCHASE_ORDER = 'CONTRACT_OR_PURCHASE_ORDER',
  OTHER = 'OTHER',
}

export interface CompanyProfileDocumentAnalysis {
  user: mongoose.Types.ObjectId;
  filename: string;
  mimeType?: string;
  size?: number;
  textHash: string;
  status: CompanyProfileDocumentAnalysisStatus;
  documentType?: CompanyProfileDocumentType | null;
  summary: string;
  capabilities: string[];
  certifications: string[];
  industries: string[];
  technologies: string[];
  countries: string[];
  languages: string[];
  referenceProjects: string[];
  experienceSignals: string[];
  limitations: string[];
  confidenceScore?: number | null;
  promptVersion: string;
  model?: string;
  errorMessage?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CompanyProfileDocumentAnalysisDocument =
  CompanyProfileDocumentAnalysis & Document;

export interface CompanyProfileDocumentAnalysisModelType extends Model<CompanyProfileDocumentAnalysisDocument> {}

const CompanyProfileDocumentAnalysisSchema = new Schema<
  CompanyProfileDocumentAnalysisDocument,
  CompanyProfileDocumentAnalysisModelType
>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    filename: { type: String, required: true },
    mimeType: String,
    size: Number,
    textHash: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(CompanyProfileDocumentAnalysisStatus),
      default: CompanyProfileDocumentAnalysisStatus.PROCESSING,
      index: true,
    },
    documentType: {
      type: String,
      enum: Object.values(CompanyProfileDocumentType),
      default: null,
      index: true,
    },
    summary: { type: String, default: '' },
    capabilities: { type: [String], default: [] },
    certifications: { type: [String], default: [] },
    industries: { type: [String], default: [] },
    technologies: { type: [String], default: [] },
    countries: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    referenceProjects: { type: [String], default: [] },
    experienceSignals: { type: [String], default: [] },
    limitations: { type: [String], default: [] },
    confidenceScore: { type: Number, min: 0, max: 100, default: null },
    promptVersion: { type: String, required: true },
    model: String,
    errorMessage: { type: String, default: null },
  } as Record<string, unknown>,
  {
    collection: 'company_profile_document_analyses',
    timestamps: true,
  },
);

CompanyProfileDocumentAnalysisSchema.index(
  { user: 1, textHash: 1 },
  { unique: true },
);

export const CompanyProfileDocumentAnalysisModel: CompanyProfileDocumentAnalysisModelType =
  (mongoose.models.CompanyProfileDocumentAnalysis as
    | CompanyProfileDocumentAnalysisModelType
    | undefined) ??
  mongoose.model<
    CompanyProfileDocumentAnalysisDocument,
    CompanyProfileDocumentAnalysisModelType
  >('CompanyProfileDocumentAnalysis', CompanyProfileDocumentAnalysisSchema);
