export const GENERAL_TENDER_ANALYSIS_PROMPT_VERSION =
  'general-tender-analysis-v1';

export type AnalysisOutputLanguage = 'en' | 'ru' | 'pl' | 'de' | 'fr';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type GeneralGoNoGo = 'GO' | 'NO_GO' | 'REVIEW';
export type GeneralRecommendation =
  | 'PROMISING'
  | 'NEEDS_REVIEW'
  | 'NOT_RECOMMENDED';

export type TenderAnalysisDepth =
  | 'STRUCTURED_NOTICE_ONLY'
  | 'NOTICE_WITH_DOCUMENTS'
  | 'FULL_DOCUMENTS';

export type EstimatedValueSource =
  | 'STRUCTURED_DATA'
  | 'XML_NOTICE'
  | 'DOCUMENT_TEXT'
  | 'NOT_FOUND';

export interface GeneralTenderAnalysisInput {
  outputLanguage?: AnalysisOutputLanguage;
  tender: {
    id: string;
    publicationNumber?: string | null;
    title?: string | null;
    description?: string | null;
    buyerName?: string | null;
    country?: string | null;
    procedureType?: string | null;
    noticeType?: string | null;
    publicationDate?: string | null;
    deadlineDate?: string | null;
    cpvCodes?: string[];
    estimatedValue?: number | null;
    currency?: string | null;
    lots?: unknown;
    awardCriteria?: unknown;
    languages?: string[];
  };
  documents: Array<{
    id?: string;
    filename?: string | null;
    language?: string | null;
    documentType?: string | null;
    extractedText: string;
  }>;
}

export interface GeneralTenderAnalysisResult {
  summary: string;

  scopeOfWork: string[];
  keyRequirements: string[];
  eligibilityCriteria: string[];
  requiredDocuments: string[];
  awardCriteria: string[];

  deadlines: Array<{
    name: string;
    date: string | null;
    description: string;
  }>;

  estimatedValue: {
    amount: number | null;
    currency: string | null;
    description: string | null;
    source: EstimatedValueSource;
  };

  advantages: string[];
  disadvantages: string[];

  risks: Array<{
    type: string;
    severity: RiskSeverity;
    description: string;
    mitigation: string | null;
  }>;

  hiddenPitfalls: string[];
  questionsToAsk: string[];

  /**
   * 0–100 score.
   */
  complexityScore: number;

  /**
   * 0–100 score.
   */
  opportunityScore: number;

  generalRecommendation: GeneralRecommendation;

  /**
   * 0–100 score.
   */
  confidenceScore: number;

  analysisDepth: TenderAnalysisDepth;
  documentsAnalyzedCount: number;
  missingDocumentsWarning: boolean;
}
