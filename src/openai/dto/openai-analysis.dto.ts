import { TenderLot } from '@/resources/tenders/schemas';
import { BuyerDetailDto } from '@/resources/buyer/schemas';

export type AnalysisOutputLanguage = 'en' | 'ru' | 'pl' | 'de' | 'fr';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type QuestionPriority = 'LOW' | 'MEDIUM' | 'HIGH';
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

export type TenderAnalysisLotSource =
  | 'STRUCTURED_DATA'
  | 'XML_NOTICE'
  | 'DOCUMENT_TEXT';

export type DocumentInputAnalysis = {
  id?: string;
  filename?: string | null;
  language?: string | null;
  documentType?: string | null;
  extractedText: string;
};

export interface GeneralTenderAnalysisInput {
  outputLanguage?: AnalysisOutputLanguage;
  tender: {
    id: string;
    title?: string | null;
    procedureTitle?: string | null;
    description?: string | null;
    lots: TenderLot[];
    country?: string | null;
    leadBuyers: BuyerDetailDto[];
    nonLeadBuyers: BuyerDetailDto[];
    buyers: BuyerDetailDto[];
    procedureType?: string | null;
    noticeType?: string | null;
    noticeSubtype?: string | null;
    noticeVersion?: string | null;
    publicationDate?: string | null;
    dispatchDate?: string | null;
    deadlineDate?: string | null;
    submissionDeadlineFallback?: string | null;
    questionsDeadline?: string | null;
    plannedStartDate?: string | null;
    plannedEndDate?: string | null;
    duration?: {
      value?: number | null;
      unit?: string | null;
    };
    contractNature?: string | null;
    legalBasis?: string | null;
    cpvCodes?: string[];
    mainCpv?: string[];
    estimatedValue?: {
      amount: number | null;
      currency: string | null;
    } | null;
    placeOfPerformance?: {
      countries?: string[];
      cities?: string[];
    };
    documentUrls?: string[];
    submissionUrls?: string[];
    flags?: {
      isDps?: boolean;
      isFrameworkAgreement?: boolean;
      isSmeSuitable?: boolean;
      isEuFunded?: boolean;
      electronicSubmission?: string | null;
    };
    awardCriteria?: unknown;
    selectionCriteria?: unknown;
    languages?: string[];
  };
  documents: DocumentInputAnalysis[];
}

export interface GeneralTenderAnalysisResult {
  summary: string;

  lots: Array<{
    identifier: string | null;
    title: string | null;
    summary: string;
    cpvCodes: string[];
    estimatedValue: {
      amount: number | null;
      currency: string | null;
      description: string | null;
    } | null;
    awardCriteria: Array<{
      type: string | null;
      description: string | null;
      weight: number | null;
      weightCode: string | null;
      summary: string;
    }>;
    deadline: string | null;
    source: TenderAnalysisLotSource;
  }>;

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
  questionsToAsk: Array<{
    priority: QuestionPriority;
    question: string;
    reason: string;
    category: string;
  }>;

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
