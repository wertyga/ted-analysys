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
  | 'bid_if_gaps_resolved'
  | 'no_bid'
  | 'not_actionable';

export interface TenderDeepAnalysisResult {
  schemaVersion: string;
  tenderId: string;
  companyId: string;
  executiveSummary: string;
  tenderIntelligence: {
    procurementObjective: string;
    buyerIntent: string;
    contractScopeSummary: string;
    expectedSupplierRole: string;
    lotsSummary: string;
    contractNature?: string;
    procedureType?: string;
    estimatedValue: {
      amount: number | null;
      currency: string | null;
      confidence: 'high' | 'medium' | 'low';
      notes: string;
    };
  };
  requirementsAnalysis: {
    mandatoryRequirements: TenderRequirement[];
    technicalRequirements: TenderRequirement[];
    eligibilityCriteria: TenderCriterion[];
    awardCriteria: AwardCriterionAnalysis[];
    submissionRequirements: SubmissionRequirementsAnalysis;
  };
  companyFitAnalysis: {
    fitScore: number;
    confidenceScore: number;
    recommendation: TenderDeepRecommendation;
    recommendationRationale: string;
    scoreBreakdown: CompanyFitScoreBreakdown;
    strengths: string[];
    weaknesses: string[];
    gaps: CompanyFitGap[];
    criticalBlockers: CompanyFitBlocker[];
    missingCompanyInformation: string[];
    missingTenderInformation: string[];
    assumptions: string[];
  };
  commercialAnalysis: {
    opportunityScore: number;
    commercialAttractiveness: 'high' | 'medium' | 'low' | 'unknown';
    pricingModel:
      | 'fixed_price'
      | 'unit_price'
      | 'framework_rates'
      | 'time_and_materials'
      | 'mixed'
      | 'unknown';
    valueFit: {
      score: number;
      explanation: string;
    };
    costDrivers: string[];
    marginRisks: string[];
    hiddenCosts: string[];
  };
  riskAnalysis: {
    overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number;
    tenderRisks: TenderRisk[];
    companySpecificRisks: TenderRisk[];
    criticalBlockers: TenderBlocker[];
    mitigations: RiskMitigation[];
  };
  opportunityAnalysis: {
    opportunityScore: number;
    opportunityLevel: 'low' | 'medium' | 'high' | 'very_high';
    whyThisCouldBeAttractive: string[];
    whyThisMayNotBeWorthIt: string[];
    likelyCompetitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  };
  bidNoBidDecision: {
    decision: BidNoBidDecision;
    rationale: string;
    conditionsForBid: string[];
    reasonsToDecline: string[];
    requiredBeforeDecision: string[];
  };
  documentationAnalysis: {
    documentsAvailable: boolean;
    documentsAnalyzedCount: number;
    documentsTotalCount: number;
    missingDocumentsWarning: boolean;
    documentationCompletenessScore: number;
    missingDocuments: string[];
  };
  clarificationQuestions: Array<{
    priority: 'high' | 'medium' | 'low';
    question: string;
    reason: string;
    relatedRequirement?: string;
    companyImpact?: string;
  }>;
  bidPreparationPlan: {
    recommendedNextSteps: BidNextStep[];
    requiredInternalInputs: string[];
    requiredExternalInputs: string[];
    suggestedBidTeamRoles: string[];
    estimatedPreparationComplexity: 'low' | 'medium' | 'high' | 'very_high';
  };
  scores: TenderDeepScores;
  finalRecommendation: {
    value: TenderDeepRecommendation;
    rationale: string;
    conditions: string[];
  };
  evidenceMap: EvidenceMapItem[];
}

export interface TenderDeepScores {
  fitScore: number;
  fitConfidenceScore: number;
  participationReadinessScore: number;
  documentationCompletenessScore: number;
  requirementsClarityScore: number;
  riskScore: number;
  opportunityScore: number;
  companyCapabilityScore: number;
  eligibilityFitScore: number;
  commercialFitScore: number;
  deadlineFitScore: number;
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

export type CompanyFitScoreBreakdown = Record<
  CompanyFitScoreKey,
  FitCriterionScore
>;

export interface TenderRequirement {
  id: string;
  category:
    | 'technical'
    | 'functional'
    | 'delivery'
    | 'financial'
    | 'professional'
    | 'legal'
    | 'administrative'
    | 'certification'
    | 'security'
    | 'sustainability'
    | 'language'
    | 'other';
  requirement: string;
  mandatoryLevel: 'mandatory' | 'optional' | 'preferred' | 'unclear';
  source:
    | 'structured_ted'
    | 'tender_document'
    | 'general_analysis'
    | 'company_profile'
    | 'inferred_from_context';
  sourceReference?: {
    documentName?: string;
    section?: string;
    page?: number | null;
    fieldName?: string;
  };
  evidenceText?: string;
  riskIfUnmet:
    | 'disqualification'
    | 'score_loss'
    | 'commercial_risk'
    | 'delivery_risk'
    | 'unknown';
  clarity: 'clear' | 'partially_clear' | 'unclear';
  notes?: string;
}

export interface TenderCriterion {
  name: string;
  description?: string;
  criterionType:
    | 'selection'
    | 'exclusion'
    | 'qualification'
    | 'award'
    | 'unknown';
  mandatoryLevel: 'mandatory' | 'optional' | 'unclear';
  requiredEvidence?: string[];
  companyFit?: {
    status: 'met' | 'partially_met' | 'not_met' | 'unknown';
    explanation: string;
    evidence?: string[];
  };
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  notes?: string;
}

export interface AwardCriterionAnalysis {
  name: string;
  description?: string;
  criterionType:
    | 'price'
    | 'quality'
    | 'technical'
    | 'delivery'
    | 'sustainability'
    | 'service_level'
    | 'experience'
    | 'other'
    | 'unknown';
  weight: number | null;
  weightUnit?: 'percentage' | 'points' | 'unknown';
  importance: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  companyCompetitiveness?: {
    score: number;
    explanation: string;
  };
  scoringImplications: string;
  risks: string[];
}

export interface SubmissionRequirementsAnalysis {
  requiredLanguages: string[];
  requiredDocuments: SubmissionDocumentRequirement[];
  submissionMethod?: string | null;
  submissionUrls?: string[];
  formatRequirements: string[];
  signatureRequirements: string[];
  deadlineAssessment: {
    submissionDeadline?: string | null;
    questionsDeadline?: string | null;
    urgency: 'expired' | 'critical' | 'short' | 'normal' | 'long' | 'unknown';
    explanation: string;
  };
  administrativeRisks: string[];
}

export interface SubmissionDocumentRequirement {
  name: string;
  description?: string;
  mandatoryLevel: 'mandatory' | 'optional' | 'unclear';
  format?: string;
  language?: string;
  signatureRequired?: boolean | null;
  relatedRequirementIds?: string[];
  companyCanProvide?: 'yes' | 'probably' | 'unknown' | 'no';
  riskIfMissing:
    | 'disqualification'
    | 'score_loss'
    | 'administrative_delay'
    | 'unknown';
}

export interface FitCriterionScore {
  score: number;
  weight: number;
  weightedScore: number;
  explanation: string;
  evidence: string[];
  missingInformation: string[];
}

export interface CompanyFitGap {
  category:
    | 'capability'
    | 'technical'
    | 'eligibility'
    | 'certification'
    | 'reference'
    | 'language'
    | 'geography'
    | 'financial'
    | 'delivery'
    | 'administrative'
    | 'commercial'
    | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  tenderRequirement?: string;
  possibleResolution?: string;
  mustResolveBeforeBid: boolean;
}

export interface CompanyFitBlocker {
  type:
    | 'expired_deadline'
    | 'scope_mismatch'
    | 'mandatory_requirement_not_met'
    | 'unsupported_language'
    | 'unsupported_geography'
    | 'insufficient_financial_capacity'
    | 'missing_required_certification'
    | 'missing_required_reference'
    | 'submission_impossible'
    | 'legal_blocker'
    | 'other';
  description: string;
  canBeResolved: boolean;
  resolutionAction?: string;
}

export interface TenderRisk {
  id: string;
  category:
    | 'deadline'
    | 'scope'
    | 'technical'
    | 'eligibility'
    | 'financial'
    | 'legal'
    | 'administrative'
    | 'documentation'
    | 'language'
    | 'delivery'
    | 'competition'
    | 'contractual'
    | 'company_fit'
    | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: 'low' | 'medium' | 'high' | 'unknown';
  description: string;
  businessImpact: string;
  mitigation?: string;
  evidence?: string[];
}

export interface TenderBlocker {
  type:
    | 'expired_deadline'
    | 'missing_documents'
    | 'unclear_scope'
    | 'mandatory_requirement'
    | 'language'
    | 'submission_access'
    | 'legal'
    | 'financial'
    | 'company_fit'
    | 'other';
  description: string;
  canBeResolved: boolean;
  resolutionAction?: string;
}

export interface RiskMitigation {
  riskId?: string;
  action: string;
  ownerRole?: string;
  urgency: 'immediate' | 'soon' | 'before_submission' | 'optional';
}

export interface BidNextStep {
  priority: 'high' | 'medium' | 'low';
  action: string;
  reason: string;
  ownerRole:
    | 'sales'
    | 'bid_manager'
    | 'legal'
    | 'finance'
    | 'technical'
    | 'delivery'
    | 'management'
    | 'partner'
    | 'unknown';
  dueTiming:
    | 'immediate'
    | 'before_questions_deadline'
    | 'before_submission'
    | 'after_gap_review'
    | 'optional';
}

export interface EvidenceMapItem {
  claim: string;
  evidenceSource:
    | 'structured_ted'
    | 'tender_document'
    | 'general_analysis'
    | 'company_profile'
    | 'derived'
    | 'missing';
  fieldName?: string;
  documentName?: string;
  evidenceText?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface CompanyAnalysisDto {
  id: string;
  companyName?: string;
  country?: string;
  operatingRegions: string[];
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
}

export interface CpvAnalysisRef {
  id?: string;
  code?: string;
  name?: string;
  description?: string;
}

export interface TenderAnalysisTenderDto {
  id: string;
  source: string;
  publicationNumber?: string;
  sourceNoticeId?: string;
  noticeType?: string;
  noticeSubtype?: string;
  noticeVersion?: string;
  procedureType?: string;
  title?: string;
  titleProc?: string;
  titleLot?: string[];
  description?: string;
  descriptionLot?: string[];
  estimatedValue?: {
    amount: number | null;
    currency: string | null;
  };
  noticeLanguage?: string;
  submissionLanguages?: string[];
  buyerName?: string;
  buyerIdentifier?: string;
  buyerCountry?: string;
  buyerCity?: string;
  buyerEmail?: string;
  buyerInternetAddress?: string;
  buyerProfile?: string;
  publicationDate?: string;
  dispatchDate?: string;
  submissionDeadline?: string;
  deadlineReceiptTender?: string;
  questionsDeadline?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  durationPeriodValue?: string;
  durationPeriodUnit?: string;
  contractNature?: string;
  legalBasis?: string;
  isDps?: boolean;
  isFrameworkAgreement?: boolean;
  isSmeSuitable?: boolean;
  electronicSubmission?: string;
  cpvCodes?: string[];
  placeOfPerformanceCountries?: string[];
  placeOfPerformanceCities?: string[];
  lotIdentifiers?: string[];
  internalLotIdentifiers?: string[];
  documentUrls?: string[];
  submissionUrls?: string[];
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
  valueBand:
    | 'micro'
    | 'small'
    | 'medium'
    | 'large'
    | 'enterprise'
    | 'unknown';
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
  tender: TenderAnalysisTenderDto;
  generalAnalysis: unknown;
  company: CompanyAnalysisDto;
  companyAnalysis?: unknown;
  derived: TenderCompanyFitDerivedMetadata;
  documentAnalyses?: unknown[];
  documentTextSnippets?: unknown[];
}
