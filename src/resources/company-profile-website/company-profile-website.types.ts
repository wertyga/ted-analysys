import { CompanyProfileDocumentUploadResult } from '@/resources/company-profile-documents/company-profile-documents.types';

export interface CompanyWebsitePage {
  url: string;
  title?: string;
  description?: string;
  lang?: string;
  hreflangs: string[];
  /** Organization-like JSON-LD blocks found on the page, raw. */
  jsonLd: string;
  text: string;
}

export interface CompanyWebsiteCrawlResult {
  /** Start page URL after redirects. */
  startUrl: string;
  pages: CompanyWebsitePage[];
  warnings: string[];
}

export interface CompanyProfileWebsiteExtractResult {
  /** Same shape as the documents upload result, so one preview form fits both. */
  resolvedProfile: CompanyProfileDocumentUploadResult['resolvedProfile'];
  website: {
    url: string;
    pages: Array<{
      url: string;
      title?: string;
      contentLength: number;
    }>;
    warnings: string[];
  };
}

export interface CompanyProfileWebsiteUsage {
  /** Pro/Business (or admin): no limit. */
  unlimited: boolean;
  freeLimit: number;
  /** Free extractions left; null when unlimited. */
  remaining: number | null;
}
