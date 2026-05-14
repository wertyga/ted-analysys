import { CurrencySign } from '@/resources/codelist';
import { UserDocument } from '@/resources/user/user.types';

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
  user: UserDocument;
  documents: Array<{
    filename: string;
    mimeType: string;
    size: number;
    textHash: string;
    contentLength: number;
    warnings: string[];
  }>;
}
