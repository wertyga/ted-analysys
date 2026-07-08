import { TenderLot } from '@/resources/tenders/schemas';
import { GeneralTenderAnalysisBuyerInput } from '@/openai/dto/openai-analysis.dto';

export type TenderDeepRecommendation =
  | 'strong_go'
  | 'go'
  | 'investigate'
  | 'caution'
  | 'no_go'
  | 'not_actionable';

export type BidNoBidDecision =
  | 'strong_bid'
  | 'bid'
  | 'bid_if_profile_completed'
  | 'bid_if_gaps_resolved'
  | 'no_bid'
  | 'not_actionable';

export enum MissingTenderDocumentType {
  SWZ = 'SWZ',
  PRICE_FORM = 'PRICE_FORM',
  TECHNICAL_SPECIFICATION = 'TECHNICAL_SPECIFICATION',
  CONTRACT_DRAFT = 'CONTRACT_DRAFT',
  CONTRACT_ANNEX = 'CONTRACT_ANNEX',
  FORM = 'FORM',
  Q_AND_A = 'Q_AND_A',
  PROCUREMENT_PACKAGE = 'PROCUREMENT_PACKAGE',
  OTHER = 'OTHER',
}

export enum MissingTenderDocumentImportance {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum MissingTenderDocumentStatus {
  MISSING = 'MISSING',
  PORTAL_LINK_AVAILABLE = 'PORTAL_LINK_AVAILABLE',
  DIRECT_LINK_AVAILABLE = 'DIRECT_LINK_AVAILABLE',
  NOT_REQUIRED = 'NOT_REQUIRED',
  ALREADY_ANALYZED = 'ALREADY_ANALYZED',
  UNKNOWN = 'UNKNOWN',
}

export interface MissingTenderDocument {
  name: string;
  type: MissingTenderDocumentType;
  importance: MissingTenderDocumentImportance;
  status: MissingTenderDocumentStatus;
  description: string;
  whyNeeded: string;
  impactIfMissing: string;
  sourceEvidence: string | null;
  portalUrl: string | null;
  directDownloadUrl: string | null;
  possibleUrls: string[];
  recommendedAction: string;
}

export interface TenderDeepMissingDocument {
  name: string;
  documentCategory: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status:
    | 'MISSING'
    | 'PORTAL_LINK_AVAILABLE'
    | 'DIRECT_LINK_AVAILABLE'
    | 'NOT_REQUIRED'
    | 'ALREADY_ANALYZED'
    | 'UNKNOWN';
  description: string;
  whyNeeded: string;
  impactIfMissing: string;
  portalUrl?: string | null;
  directDownloadUrl?: string | null;
  possibleUrls: string[];
  recommendedAction: string;
}

export interface TenderDeepAnalysisResult {
  executiveSummary: string;
  requirementChecks: Array<{
    requirement: string;
    isMandatory: boolean;
    status: 'PASS' | 'PARTIAL' | 'UNKNOWN' | 'FAIL';
    severityIfUnresolved?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    explanation: string;
  }>;
  companyFitAnalysis: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    gaps: Array<{
      title: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      mustResolveBeforeBid: boolean;
    }>;
  };
  commercialAnalysis: {
    summary: string;
    pricingConsiderations: string;
    valueFitExplanation: string;
    costDrivers: string[];
    marginRisks: string[];
    hiddenCosts: string[];
  };
  riskAnalysis: {
    tenderRisks: TenderDeepRiskItem[];
    companySpecificRisks: TenderDeepRiskItem[];
  };
  documentationAnalysis: { missingDocuments: TenderDeepMissingDocument[] };
  clarificationQuestions: TenderDeepClarificationQuestion[];
  bidPreparationPlan: {
    recommendedNextSteps: TenderDeepBidNextStep[];
    requiredInternalInputs: string[];
    requiredExternalInputs: string[];
    suggestedBidTeamRoles: string[];
    estimatedPreparationComplexity: 'low' | 'medium' | 'high' | 'very_high';
  };
  scores: {
    scoreBreakdown: Array<{
      criterion: string;
      score: number;
      explanation: string;
    }>;
    fitScore: number;
    participationReadinessScore: number;
    documentationCompletenessScore: number;
    requirementsClarityScore: number;
    riskScore: number;
    opportunityScore: number;
  };
  finalRecommendation: {
    value: TenderDeepRecommendation;
    summary: string;
    rationale: string;
    conditions: string[];
  };
  bidNoBidDecision: {
    decision: BidNoBidDecision;
    rationale: string;
    conditionsForBid: string[];
    reasonsToDecline: string[];
    requiredBeforeDecision: string[];
  };
  opportunityAnalysis: {
    summary: string;
    whyThisCouldBeAttractive: string[];
    whyThisMayNotBeWorthIt: string[];
    likelyCompetitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  };
  buyerSelectionAssessment: {
    probabilityScore: number;
    probabilityLevel: 'low' | 'medium' | 'high' | 'unknown';
    summary: string;
    buyerBehaviorSummary: string;
    idealSupplierProfile: string[];
    companyAlignmentWithBuyer: {
      matches: string[];
      mismatches: string[];
    };
    competitivePosition: {
      level: 'strong' | 'average' | 'weak' | 'unknown';
      explanation: string;
    };
    winDrivers: string[];
    lossDrivers: string[];
    recommendationsToIncreaseWinProbability: string[];
    buyerSignalsUsed: string[];
    dataLimitations: string[];
  };
}

export interface TenderDeepRiskItem {
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: 'low' | 'medium' | 'high' | 'unknown';
  description: string;
  businessImpact: string;
  mitigation?: string;
}

export interface TenderDeepClarificationQuestion {
  priority: 'high' | 'medium' | 'low';
  question: string;
  reason: string;
  questionCategory?: string;
  companyImpact?: string;
}

export interface TenderDeepBidNextStep {
  priority: 'high' | 'medium' | 'low';
  action: string;
  reason: string;
  ownerRole: string;
  dueTiming:
    | 'immediate'
    | 'before_questions_deadline'
    | 'before_submission'
    | 'after_gap_review'
    | 'optional';
}

export type CompanyFitScoreKey =
  | 'scopeFit'
  | 'capabilityFit'
  | 'cpvFit'
  | 'geographicFit'
  | 'languageFit'
  | 'eligibilityFit'
  | 'certificationFit'
  | 'experienceFit'
  | 'financialFit'
  | 'commercialFit'
  | 'deadlineFit'
  | 'riskFit';

export interface CompanyAnalysisDto {
  id: string;
  companyName?: string;
  country?: string;
  operatingCountries: string[];
  companySize?: number;
  companyDescription?: string;
  industries: CpvAnalysisRef[];
  mainServices: CpvAnalysisRef[];
  languages: string[];
  certifications?: string[];
  capabilities?: string[];
  yearsOfExperience?: number;
  publicProcurementExperience?: boolean;
  typicalContractSize?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  companyDocumentEvidence?: CompanyAnalysisDocumentEvidence;
}

export interface CompanyAnalysisDocumentEvidence {
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
  documents: Array<{
    filename: string;
    textHash: string;
    documentType?: string | null;
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
  }>;
}

export interface CpvAnalysisRef {
  id?: string;
  code?: string;
  name?: string;
  description?: string;
}

export interface TenderAnalysisTenderDto {
  id: string;
  noticeType?: string;
  noticeSubtype?: string;
  noticeVersion?: string;
  procedureType?: string;
  title?: string;
  titleProc?: string;
  description?: string;
  lots: TenderLot[];
  estimatedValue?: {
    amount: number | null;
    currency: string | null;
  };
  noticeLanguage?: string;
  submissionLanguages?: string[];
  leadBuyers: GeneralTenderAnalysisBuyerInput[];
  nonLeadBuyers: GeneralTenderAnalysisBuyerInput[];
  publicationDate?: Date;
  dispatchDate?: Date;
  submissionDeadline?: Date;
  deadlineReceiptTender?: Date;
  questionsDeadline?: Date;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  duration?: {
    value: number | null | undefined;
    unit: string | null;
  };
  contractNature?: string;
  legalBasis?: string;
  electronicSubmission?: string;
  cpvCodes?: CpvAnalysisRef[];
  placeOfPerformanceCountries?: string[];
  placeOfPerformanceCities?: string[];
  documentUrls?: string[];
  submissionUrls?: string[];
  documentAccess?: unknown;
  euFundLot?: boolean;
  selectionCriteria?: unknown[];
  awardCriteria?: unknown[];
  links?: unknown;
}

export interface TenderCompanyFitDerivedMetadata {
  currentDate: string;
  daysUntilSubmissionDeadline?: number | null;
  daysUntilQuestionsDeadline?: number | null;
  isDeadlineExpired: boolean;
  isQuestionsDeadlineExpired?: boolean | null;
  hasLots: boolean;
  lotCount: number;
  hasEstimatedValue: boolean;
  hasDocumentUrls: boolean;
  documentUrlsCount: number;
  documentsDownloadedCount: number;
  documentsAnalyzedCount: number;
  hasSelectionCriteria: boolean;
  hasAwardCriteria: boolean;
  hasCpvCodes: boolean;
  valueBand: 'micro' | 'small' | 'medium' | 'large' | 'enterprise' | 'unknown';
  deadlineUrgency:
    | 'expired'
    | 'critical'
    | 'short'
    | 'normal'
    | 'long'
    | 'unknown';
  preliminarySignals: {
    cpvOverlap?: boolean;
    countryOverlap?: boolean;
    languageOverlap?: boolean;
    estimatedValueWithinCompanyRange?: boolean | null;
  };
}

export interface TenderDeepCompanyFitAnalysisInput {
  outputLanguage?: string;
  tender: TenderAnalysisTenderDto;
  generalAnalysis: unknown;
  company: CompanyAnalysisDto;
  companyAnalysis?: unknown;
  buyerIntelligence?: TenderDeepBuyerIntelligenceInput[];
  derived: TenderCompanyFitDerivedMetadata;
  documentMetadata?: unknown[];
  documentTextSnippets?: unknown[];
}

export interface TenderDeepBuyerIntelligenceInput {
  buyerId: string;
  buyerName?: string;
  summary?: string;
  procurementProfile?: {
    overview?: string;
    highlights?: string[];
  };
  marketBehavior?: {
    overview?: string;
    highlights?: string[];
  };
  supplierLandscape?: {
    overview?: string;
    highlights?: string[];
  };
  historicalTrends?: string[];
  dataLimitations?: string[];
  buyerDecisionSignals?: {
    idealSupplierProfile?: string[];
    supplierPatternSignals?: string[];
    competitionSignals?: string[];
    dataConfidence?: 'low' | 'medium' | 'high';
  };
}
