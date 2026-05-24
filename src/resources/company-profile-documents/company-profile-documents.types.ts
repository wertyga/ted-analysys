import { CurrencySign } from '@/resources/codelist';
import { CompanyProfileDocumentType } from './schemas';

export interface CompanyProfileDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface CompanyProfileAiResult {
  companyName?: string | null;
  country?: string | null;
  operatingCountries?: string[];
  companySize?: number | null;
  companyDescription?: string | null;
  industries?: string[];
  mainServices?: string[];
  languages?: string[];
  minDaysBeforeDeadline?: number | null;
  certifications?: string[];
  capabilities?: string[];
  yearsOfExperience?: number | null;
  publicProcurementExperience?: boolean | null;
  typicalContractSize?: {
    min?: number | null;
    max?: number | null;
    currency?: CurrencySign | null;
  } | null;
}

export interface CompanyProfileDocumentUploadResult {
  profile: CompanyProfileAiResult;
  resolvedProfile: Omit<
    CompanyProfileAiResult,
    'industries' | 'mainServices'
  > & {
    industries?: string[];
    mainServices?: string[];
  };
  documents: Array<{
    filename: string;
    mimeType: string;
    size: number;
    textHash: string;
    contentLength: number;
    warnings: string[];
    analysis?: CompanyProfileDocumentAnalysisResult;
  }>;
}

export interface CompanyProfileDocumentAnalysisResult {
  status?: string;
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
  errorMessage?: string | null;
  analyzedAt?: Date | null;
}

export interface CompanyDocumentEvidenceItem
  extends CompanyProfileDocumentAnalysisResult {
  filename: string;
  textHash: string;
}

export interface CompanyDocumentEvidence {
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
  documents: CompanyDocumentEvidenceItem[];
}
