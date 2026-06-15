import { Injectable } from '@nestjs/common';
import {
  BidNoBidDecision,
  CompanyAnalysisDto,
  CompanyFitScoreBreakdown,
  CompanyFitScoreKey,
  CpvAnalysisRef,
  TenderAnalysisTenderDto,
  TenderCompanyFitDerivedMetadata,
  TenderDeepAnalysisResult,
  TenderDeepCompanyFitAnalysisInput,
  TenderDeepRecommendation,
  CompanyAnalysisDocumentEvidence,
  TenderRequirement,
} from '@/types';
import { isRecord } from '@/utils';
import { Tender, TenderDocument, TenderLot } from '../tenders/schemas';
import { UserDocument } from '../user/user.types';
import { TenderGeneralAnalysis } from '../tender-analysis/schemas';
import {
  collectAnalyzedDocumentNames,
  collectTenderDocumentAccessUrls,
  normalizeMissingDocuments,
} from './missing-tender-documents.utils';
import { TENDER_DEEP_ANALYSIS_CONFIG } from '@/config/tender-deep-analysis.config';

export const COMPANY_FIT_WEIGHTS =
  TENDER_DEEP_ANALYSIS_CONFIG.scoring.companyFitWeights;

const SCORE_KEYS = Object.keys(COMPANY_FIT_WEIGHTS) as CompanyFitScoreKey[];

type MutableScoreSource = Partial<Record<CompanyFitScoreKey, unknown>> & {
  scoreBreakdown?: unknown;
  __scoreBreakdownRecord?: CompanyFitScoreBreakdown;
  scoreTotal?: unknown;
  weightedSum?: unknown;
  totalWeight?: unknown;
};

type MutableDeepResult = TenderDeepAnalysisResult & {
  companyFitAnalysis: TenderDeepAnalysisResult['companyFitAnalysis'] &
    MutableScoreSource;
  scores: TenderDeepAnalysisResult['scores'] & MutableScoreSource;
};

@Injectable()
export class TenderDeepAnalysisBuilder {
  buildCompanyAnalysisDto(
    user: UserDocument,
    companyDocumentEvidence?: CompanyAnalysisDocumentEvidence,
  ): CompanyAnalysisDto {
    const source = user as any;

    return {
      id: String(source._id),
      companyName: source.companyName || undefined,
      country: source.country || undefined,
      operatingCountries: source.operatingCountries ?? [],
      companySize:
        typeof source.companySize === 'number' ? source.companySize : undefined,
      companyDescription: source.companyDescription || undefined,
      industries: normalizeCpvRefs(source.industries),
      mainServices: normalizeCpvRefs(source.mainServices),
      languages: Array.isArray(source.languages) ? source.languages : [],
      certifications: Array.isArray(source.certifications)
        ? source.certifications
        : undefined,
      capabilities: Array.isArray(source.capabilities)
        ? source.capabilities
        : undefined,
      yearsOfExperience:
        typeof source.yearsOfExperience === 'number'
          ? source.yearsOfExperience
          : undefined,
      publicProcurementExperience:
        typeof source.publicProcurementExperience === 'boolean'
          ? source.publicProcurementExperience
          : undefined,
      typicalContractSize: source.typicalContractSize
        ? {
            min: source.typicalContractSize.min,
            max: source.typicalContractSize.max,
            currency: source.typicalContractSize.currency,
          }
        : undefined,
      companyDocumentEvidence,
    };
  }

  buildTenderDto(tender: TenderDocument): TenderAnalysisTenderDto {
    return {
      id: tender.id,
      publicationNumber: tender.publicationNumber,
      noticeType: tender.noticeType,
      noticeSubtype: tender.noticeSubtype,
      noticeVersion: tender.noticeVersion,
      procedureType: tender.procedureType,
      title: tender.title,
      titleProc: tender.titleProc,
      description: tender.description,
      lots: tender.lots?.map((lot) => buildLotDto(lot)) ?? [],
      estimatedValue: tender.estimatedValue,
      noticeLanguage: tender.noticeLanguage,
      submissionLanguages: tender.submissionLanguages ?? [],
      buyerName: tender.buyerName,
      buyerIdentifier: tender.buyerIdentifier,
      buyerCountry: tender.buyerCountry,
      buyerCity: tender.buyerCity,
      buyerEmail: tender.buyerEmail,
      buyerInternetAddress: tender.buyerInternetAddress,
      buyerProfile: tender.buyerProfile,
      publicationDate: formatDate(tender.publicationDate),
      dispatchDate: formatDate(tender.dispatchDate),
      submissionDeadline: formatDate(tender.submissionDeadline),
      deadlineReceiptTender: formatDate(tender.deadlineReceiptTender),
      questionsDeadline: formatDate(tender.questionsDeadline),
      plannedStartDate: formatDate(tender.plannedStartDate),
      plannedEndDate: formatDate(tender.plannedEndDate),
      durationPeriodValue: tender.durationPeriodValue,
      durationPeriodUnit: tender.durationPeriodUnit,
      contractNature: tender.contractNature,
      legalBasis: tender.legalBasis,
      isDps: tender.isDps,
      isFrameworkAgreement: tender.isFrameworkAgreement,
      isSmeSuitable: tender.isSmeSuitable,
      electronicSubmission: tender.electronicSubmission,
      cpvCodes: extractCpvCodes(tender),
      placeOfPerformanceCountries: tender.placeOfPerformanceCountries ?? [],
      placeOfPerformanceCities: tender.placeOfPerformanceCities ?? [],
      internalLotIdentifiers: tender.internalLotIdentifiers ?? [],
      documentUrls: tender.documentUrls ?? [],
      submissionUrls: tender.submissionUrls ?? [],
      documentAccess: (tender as unknown as { documentAccess?: unknown })
        .documentAccess,
      euFundLot: tender.euFundLot,
      selectionCriteria: tender.selectionCriteria ?? [],
      awardCriteria: tender.awardCriteria ?? [],
      links: tender.links,
    };
  }

  buildDerivedMetadata(params: {
    tender: Tender;
    company: CompanyAnalysisDto;
    documentsDownloadedCount?: number;
    documentsAnalyzedCount?: number;
  }): TenderCompanyFitDerivedMetadata {
    const now = new Date();
    const submissionDays = daysUntil(params.tender.submissionDeadline, now);
    const questionsDays = daysUntil(params.tender.questionsDeadline, now);
    const isDeadlineExpired =
      params.tender.submissionDeadline !== undefined &&
      params.tender.submissionDeadline.getTime() < now.getTime();
    const isQuestionsDeadlineExpired = params.tender.questionsDeadline
      ? params.tender.questionsDeadline.getTime() < now.getTime()
      : null;
    const documentUrlsCount = countTenderDocumentUrls(params.tender);

    return {
      currentDate: now.toISOString().slice(0, 10),
      daysUntilSubmissionDeadline: submissionDays,
      daysUntilQuestionsDeadline: questionsDays,
      isDeadlineExpired,
      isQuestionsDeadlineExpired,
      hasLots: (params.tender.lots?.length ?? 0) > 0,
      lotCount: params.tender.lots?.length ?? 0,
      hasEstimatedValue:
        typeof params.tender.estimatedValue?.amount === 'number',
      hasDocumentUrls: documentUrlsCount > 0,
      documentUrlsCount,
      documentsDownloadedCount: params.documentsDownloadedCount ?? 0,
      documentsAnalyzedCount: params.documentsAnalyzedCount ?? 0,
      hasSelectionCriteria: (params.tender.selectionCriteria?.length ?? 0) > 0,
      hasAwardCriteria: (params.tender.awardCriteria?.length ?? 0) > 0,
      hasCpvCodes: extractCpvCodes(params.tender).length > 0,
      valueBand: getValueBand(params.tender.estimatedValue?.amount),
      deadlineUrgency: getDeadlineUrgency(submissionDays, isDeadlineExpired),
      preliminarySignals: {
        cpvOverlap: getCpvOverlap(params.tender, params.company),
        countryOverlap: getCountryOverlap(params.tender, params.company),
        languageOverlap: getLanguageOverlap(params.tender, params.company),
        estimatedValueWithinCompanyRange: getEstimatedValueWithinCompanyRange(
          params.tender,
          params.company,
        ),
      },
    };
  }

  buildInput(params: {
    tender: TenderDocument;
    generalAnalysis?: TenderGeneralAnalysis | null;
    company: CompanyAnalysisDto;
    companyAnalysis?: unknown;
    documentMetadata?: unknown[];
    documentTextSnippets?: unknown[];
    outputLanguage?: string;
  }): TenderDeepCompanyFitAnalysisInput {
    const documentMetadata = params.documentMetadata ?? [];

    return {
      outputLanguage: params.outputLanguage ?? 'en',
      tender: this.buildTenderDto(params.tender),
      generalAnalysis: params.generalAnalysis?.resultJson ?? null,
      company: params.company,
      companyAnalysis: params.companyAnalysis ?? null,
      derived: this.buildDerivedMetadata({
        tender: params.tender,
        company: params.company,
        documentsDownloadedCount: documentMetadata.length,
        documentsAnalyzedCount: documentMetadata.length,
      }),
      documentMetadata,
      documentTextSnippets: params.documentTextSnippets ?? [],
    };
  }

  normalizeResult(
    result: TenderDeepAnalysisResult,
    input: TenderDeepCompanyFitAnalysisInput,
  ): TenderDeepAnalysisResult {
    ensureResultShape(result, input);
    applyMissingCompanyInfo(result, input);
    applyScoreBreakdown(result);
    applyGuardrails(result, input);
    validateRequiredScoreBreakdown(result);
    applyScoreBreakdown(result);

    const recommendation = calculateFinalRecommendation(result, input);
    result.finalRecommendation.value = recommendation;
    result.companyFitAnalysis.recommendation = recommendation;
    result.bidNoBidDecision.decision =
      mapRecommendationToBidDecision(recommendation);
    applyDecisionFactors(result, input);
    applyDocumentationAndClarity(result, input);
    applyProcedureConsistency(result, input);
    applyFinalRecommendationConsistency(result);
    cleanupCompanyFitAnalysis(result);
    applyConfidence(result, input);

    result.scores.participationReadinessScore = clampRound(
      result.scores.participationReadinessScore,
    );
    result.scores.documentationCompletenessScore = clampRound(
      result.documentationAnalysis.documentationCompletenessScore,
    );
    result.scores.requirementsClarityScore = clampRound(
      result.scores.requirementsClarityScore,
    );
    result.scores.riskLevelScore = calculateRiskLevelScore(result);
    result.scores.riskScore = result.scores.riskLevelScore;
    result.scores.opportunityScore = clampRound(
      result.opportunityAnalysis.opportunityScore,
    );
    result.scores.companyCapabilityScore = clampRound(
      result.scores.companyCapabilityScore,
    );
    const scoreBreakdown = getScoreBreakdownRecord(result);
    result.scores.eligibilityFitScore = clampRound(
      scoreBreakdown.eligibilityFit.score,
    );
    result.scores.commercialFitScore = clampRound(
      scoreBreakdown.commercialFit.score,
    );
    result.scores.deadlineFitScore = clampRound(
      scoreBreakdown.deadlineFit.score,
    );
    result.scores.riskFitScore = clampRound(scoreBreakdown.riskFit.score);
    applyUserFacingScoreExplanations(result);
    applyCompanyFitSummaryFields(result);
    syncDocumentationScores(result);
    normalizeRequirementsClarityFields(result);
    syncLegacyFitScores(result);
    normalizeRiskSeverityLabels(result);
    removeEmptyScoreEvidence(result);
    normalizeEvidenceMap(result);
    removeDuplicateScoreBreakdowns(result);

    return result;
  }
}

export function normalizeCpvRefs(values: unknown): CpvAnalysisRef[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((item: any) => {
    if (!item) {
      return {};
    }

    if (typeof item === 'string') {
      return { id: item };
    }

    if (item._id || item.id) {
      return {
        id: String(item._id || item.id),
        code: item.code || item.cpvCode || item.value || undefined,
        name: item.name || item.title || item.label || undefined,
        description: item.description || undefined,
      };
    }

    return { id: String(item) };
  });
}

export function calculateFinalRecommendation(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): TenderDeepRecommendation {
  const fitScore = result.scores.fitScore;
  const blockers = result.companyFitAnalysis.criticalBlockers ?? [];

  if (input.derived.isDeadlineExpired) {
    return 'not_actionable';
  }

  if (blockers.some((blocker) => blocker.canBeResolved === false)) {
    return 'no_go';
  }

  if (fitScore >= 80 && blockers.length === 0) {
    return 'strong_go';
  }

  if (fitScore >= 65 && blockers.length === 0) {
    return 'go';
  }

  if (fitScore >= 45) {
    return 'investigate';
  }

  if (fitScore >= 30) {
    return 'caution';
  }

  return 'no_go';
}

function ensureResultShape(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  result.schemaVersion ||= '1.0.0';
  result.language = input.outputLanguage ?? result.language ?? 'en';
  result.tenderId = input.tender.id;
  result.tenderIntelligence ||=
    {} as TenderDeepAnalysisResult['tenderIntelligence'];
  applyTenderIntelligenceSourceFields(result, input);
  result.companyFitAnalysis ||=
    {} as TenderDeepAnalysisResult['companyFitAnalysis'];
  result.companyFitAnalysis.strengths ||= [];
  result.companyFitAnalysis.weaknesses ||= [];
  result.companyFitAnalysis.gaps ||= [];
  result.companyFitAnalysis.criticalBlockers ||= [];
  result.companyFitAnalysis.missingCompanyInformation ||= [];
  result.companyFitAnalysis.missingTenderInformation ||= [];
  result.companyFitAnalysis.assumptions ||= [];
  normalizeRiskAnalysisShape(result);
  result.riskAnalysis ||= {} as TenderDeepAnalysisResult['riskAnalysis'];
  result.riskAnalysis.tenderRisks ||= [];
  result.riskAnalysis.companySpecificRisks ||= [];
  result.riskAnalysis.criticalBlockers ||= [];
  result.documentationAnalysis ||=
    {} as TenderDeepAnalysisResult['documentationAnalysis'];
  result.scores ||= {} as TenderDeepAnalysisResult['scores'];
  result.documentationScores ||= {} as NonNullable<
    TenderDeepAnalysisResult['documentationScores']
  >;
  result.requirementsClarity ||= {} as NonNullable<
    TenderDeepAnalysisResult['requirementsClarity']
  >;
  result.decisionFactors ||= {
    criticalBlockers: [],
  };
  result.decisionFactors.criticalBlockers ||= [];
  result.confidence ||= {} as TenderDeepAnalysisResult['confidence'];
  result.finalRecommendation ||=
    {} as TenderDeepAnalysisResult['finalRecommendation'];
  migrateLegacyScoreBreakdown(result);
  validateScoreBreakdownShape(result);
  applyDocumentCounts(result, input);
}

function normalizeRiskAnalysisShape(result: TenderDeepAnalysisResult): void {
  const riskAnalysis = result.riskAnalysis as unknown;

  if (!Array.isArray(riskAnalysis)) {
    return;
  }

  result.riskAnalysis = {
    overallRiskLevel: 'critical',
    riskScore: 0,
    tenderRisks: [],
    companySpecificRisks: [],
    criticalBlockers: [],
    mitigations: [],
    risks: riskAnalysis,
  } as unknown as TenderDeepAnalysisResult['riskAnalysis'];
}

function applyTenderIntelligenceSourceFields(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  const originalTitle = input.tender.title ?? input.tender.titleProc;

  result.tenderIntelligence.originalTitle ||= originalTitle;
  result.tenderIntelligence.title ||= originalTitle ?? '';
  result.tenderIntelligence.lotsSummary ||= '';

  const sourceLots = input.tender.lots ?? [];
  const existingLots = Array.isArray(result.tenderIntelligence.lots)
    ? result.tenderIntelligence.lots
    : [];
  const lotCount = Math.max(existingLots.length, sourceLots.length);

  if (lotCount === 0) {
    result.tenderIntelligence.lots = [];
    return;
  }

  result.tenderIntelligence.lots = Array.from({ length: lotCount }).map(
    (_, index) => {
      const existing = existingLots[index];
      const sourceLot = sourceLots[index];
      const sourceTitle = sourceLot?.title;
      const sourceId = sourceLot?.identifier;

      return {
        id: existing?.id ?? sourceId,
        title: existing?.title ?? sourceTitle ?? sourceId ?? '',
        originalTitle: existing?.originalTitle ?? sourceTitle,
        summary: existing?.summary,
      };
    },
  );
}

function migrateLegacyScoreBreakdown(result: TenderDeepAnalysisResult): void {
  const scoreBreakdown = getScoreBreakdownRecord(result);
  const mutable = result as MutableDeepResult;
  const scoreBreakdownItems = Array.isArray(mutable.scores.scoreBreakdown)
    ? mutable.scores.scoreBreakdown
    : [];

  for (const key of SCORE_KEYS) {
    if (scoreBreakdown[key]) {
      continue;
    }

    const directCompanyScore = mutable.companyFitAnalysis[key];
    const scoresBreakdownItem = scoreBreakdownItems.find((item) => {
      return isRecord(item) && item.criterion === key;
    });
    const legacyScore =
      directCompanyScore ?? scoresBreakdownItem ?? mutable.scores[key];

    if (isScoreBreakdownItem(legacyScore)) {
      scoreBreakdown[key] = {
        score: legacyScore.score,
        weight: COMPANY_FIT_WEIGHTS[key],
        weightedScore:
          typeof legacyScore.weightedScore === 'number'
            ? legacyScore.weightedScore
            : 0,
        explanation: legacyScore.explanation ?? '',
        evidence: normalizeStringList(legacyScore.evidence),
        missingInformation: normalizeStringList(
          legacyScore.missingInformation ?? legacyScore.missingInfo,
        ),
      };
    }
  }
}

function applyDocumentCounts(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  const noticeDocumentsAnalyzedCount = input.derived.documentsAnalyzedCount;

  result.documentationAnalysis.noticeDocumentsAnalyzedCount =
    noticeDocumentsAnalyzedCount;
  const procurementDocumentsAnalyzedCount = 0;
  result.documentationAnalysis.procurementDocumentsAnalyzedCount =
    procurementDocumentsAnalyzedCount;
  result.documentationAnalysis.documentsAnalyzedCount =
    noticeDocumentsAnalyzedCount + procurementDocumentsAnalyzedCount;
  result.documentationAnalysis.documentsTotalCount = Math.max(
    input.derived.documentUrlsCount,
    result.documentationAnalysis.documentsAnalyzedCount,
  );
  result.documentationAnalysis.documentsAvailable =
    noticeDocumentsAnalyzedCount > 0;
  result.documentationAnalysis.missingDocumentsWarning = false;
}

function isScoreBreakdownItem(value: unknown): value is {
  score: number;
  weightedScore?: number;
  explanation?: string;
  evidence?: unknown;
  missingInformation?: unknown;
  missingInfo?: unknown;
} {
  return isRecord(value) && typeof value.score === 'number';
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : undefined))
      .filter((item): item is string => item !== undefined);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function getScoreBreakdownRecord(
  result: TenderDeepAnalysisResult,
): CompanyFitScoreBreakdown {
  const mutable = result as MutableDeepResult;
  const internalRecord = mutable.scores.__scoreBreakdownRecord;

  if (internalRecord) {
    return internalRecord;
  }

  const current = mutable.scores.scoreBreakdown;
  let record = {} as CompanyFitScoreBreakdown;

  if (Array.isArray(current)) {
    record = current.reduce((accumulator, item) => {
      if (
        isRecord(item) &&
        typeof item.criterion === 'string' &&
        SCORE_KEYS.includes(item.criterion as CompanyFitScoreKey) &&
        isScoreBreakdownItem(item)
      ) {
        record[item.criterion as CompanyFitScoreKey] = {
          score: item.score,
          weight:
            typeof item.weight === 'number'
              ? item.weight
              : COMPANY_FIT_WEIGHTS[item.criterion as CompanyFitScoreKey],
          weightedScore:
            typeof item.weightedScore === 'number' ? item.weightedScore : 0,
          explanation:
            typeof item.explanation === 'string' ? item.explanation : '',
          evidence: normalizeStringList(item.evidence),
          missingInformation: normalizeStringList(item.missingInformation),
        };
      }

      return accumulator;
    }, {} as CompanyFitScoreBreakdown);
  } else if (isRecord(current)) {
    record = current as unknown as CompanyFitScoreBreakdown;
  }

  mutable.scores.__scoreBreakdownRecord = record;

  return record;
}

function applyScoreBreakdown(result: TenderDeepAnalysisResult): void {
  const fallbackFitScore = getFallbackFitScore(result);
  const scoreBreakdown = getScoreBreakdownRecord(result);
  let fitScore = 0;

  for (const key of SCORE_KEYS) {
    const item = scoreBreakdown[key];
    item.score = clampRound(
      typeof item.score === 'number'
        ? item.score
        : deriveScoreFromWeightedScore(item.weightedScore, key),
    );
    item.weight = COMPANY_FIT_WEIGHTS[key];
    item.weightedScore = roundScore((item.score * item.weight) / 100);
    item.evidence = Array.isArray(item.evidence) ? item.evidence : [];
    item.missingInformation = Array.isArray(item.missingInformation)
      ? item.missingInformation
      : [];
    fitScore += item.weightedScore;
  }

  const weightedFitScore = clampScore(roundScore(fitScore));
  result.companyFitAnalysis.fitScore =
    weightedFitScore > 0 ? weightedFitScore : fallbackFitScore;
  result.scores.fitScore = result.companyFitAnalysis.fitScore;
  result.scores.weightedSum = result.scores.fitScore;
  result.scores.totalWeight = Object.values(COMPANY_FIT_WEIGHTS).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  result.scores.scoreBreakdown = SCORE_KEYS.map((criterion) => ({
    criterion,
    ...scoreBreakdown[criterion],
  }));
}

function getFallbackFitScore(result: TenderDeepAnalysisResult): number {
  const candidates = [
    result.companyFitAnalysis.fitScore,
    result.scores.fitScore,
    (result.companyFitAnalysis as unknown as { scoreTotal?: unknown })
      .scoreTotal,
    (result.scores as unknown as { scoreTotal?: unknown }).scoreTotal,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && candidate > 0) {
      return clampScore(candidate);
    }
  }

  return 0;
}

function deriveScoreFromWeightedScore(
  weightedScore: unknown,
  key: CompanyFitScoreKey,
): number | undefined {
  if (typeof weightedScore !== 'number' || weightedScore <= 0) {
    return undefined;
  }

  return (weightedScore * 100) / COMPANY_FIT_WEIGHTS[key];
}

function validateScoreBreakdownShape(result: TenderDeepAnalysisResult): void {
  const rawScoreBreakdown = (result as MutableDeepResult).scores.scoreBreakdown;

  if (!Array.isArray(rawScoreBreakdown)) {
    throw new Error(
      'Deep tender analysis result must include scores.scoreBreakdown as an array',
    );
  }

  const seenCriteria = new Set<CompanyFitScoreKey>();

  for (const item of rawScoreBreakdown) {
    if (!isRecord(item)) {
      throw new Error(
        'Deep tender analysis result scores.scoreBreakdown items must be objects',
      );
    }

    if (
      typeof item.criterion !== 'string' ||
      !SCORE_KEYS.includes(item.criterion as CompanyFitScoreKey)
    ) {
      throw new Error(
        'Deep tender analysis result scores.scoreBreakdown item has an unknown criterion',
      );
    }

    const criterion = item.criterion as CompanyFitScoreKey;

    if (seenCriteria.has(criterion)) {
      throw new Error(
        `Deep tender analysis result has duplicate scores.scoreBreakdown.${criterion}`,
      );
    }

    seenCriteria.add(criterion);

    if (typeof item.score !== 'number' || !Number.isFinite(item.score)) {
      throw new Error(
        `Deep tender analysis result is missing numeric scores.scoreBreakdown.${criterion}.score`,
      );
    }

    if (typeof item.weight !== 'number' || !Number.isFinite(item.weight)) {
      throw new Error(
        `Deep tender analysis result is missing numeric scores.scoreBreakdown.${criterion}.weight`,
      );
    }

    if (
      typeof item.weightedScore !== 'number' ||
      !Number.isFinite(item.weightedScore)
    ) {
      throw new Error(
        `Deep tender analysis result is missing numeric scores.scoreBreakdown.${criterion}.weightedScore`,
      );
    }

    const hasExplanation =
      typeof item.explanation === 'string' && item.explanation.trim().length > 0;

    if (!hasExplanation) {
      throw new Error(
        `Deep tender analysis result is missing scores.scoreBreakdown.${criterion}.explanation`,
      );
    }

    if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
      throw new Error(
        `Deep tender analysis result is missing scores.scoreBreakdown.${criterion}.evidence`,
      );
    }

    if (!Array.isArray(item.missingInformation)) {
      throw new Error(
        `Deep tender analysis result is missing scores.scoreBreakdown.${criterion}.missingInformation`,
      );
    }
  }

  const scoreBreakdown = getScoreBreakdownRecord(result);
  const missingKeys = SCORE_KEYS.filter((key) => !scoreBreakdown[key]);

  if (missingKeys.length > 0) {
    throw new Error(
      `Deep tender analysis result is missing scores.scoreBreakdown items: ${missingKeys.join(
        ', ',
      )}`,
    );
  }
}

function removeDuplicateScoreBreakdowns(
  result: TenderDeepAnalysisResult,
): void {
  const mutable = result as MutableDeepResult;

  delete mutable.companyFitAnalysis.scoreBreakdown;

  for (const key of SCORE_KEYS) {
    delete mutable.companyFitAnalysis[key];
    delete mutable.scores[key];
  }

  delete mutable.scores.__scoreBreakdownRecord;
}

function applyConfidence(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  const existing = result.confidence;
  const recommendationConfidence = getRecommendationConfidence(result, input);
  const tenderDataConfidence =
    existing.tenderDataConfidence > 0
      ? clampRound(existing.tenderDataConfidence)
      : calculateTenderDataConfidence(input);
  const companyProfileConfidence =
    existing.companyProfileConfidence > 0
      ? clampRound(existing.companyProfileConfidence)
      : calculateCompanyProfileConfidence(result, input);
  const scoringConfidence =
    existing.scoringConfidence > 0
      ? clampRound(existing.scoringConfidence)
      : calculateScoringConfidence(
          recommendationConfidence,
          tenderDataConfidence,
          companyProfileConfidence,
          result,
        );

  result.confidence = {
    recommendationConfidence,
    tenderDataConfidence,
    companyProfileConfidence,
    scoringConfidence,
  };
  result.finalRecommendation.confidenceScore = recommendationConfidence;
  result.scores.fitConfidenceScore = scoringConfidence;
  result.companyFitAnalysis.confidenceScore = scoringConfidence;
}

function validateRequiredScoreBreakdown(
  result: TenderDeepAnalysisResult,
): void {
  validateScoreBreakdownShape(result);
}

function applyDecisionFactors(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  normalizeRiskCriticalBlockers(result);

  const blockers = result.decisionFactors?.criticalBlockers ?? [];

  for (const blocker of result.companyFitAnalysis.criticalBlockers ?? []) {
    addDecisionBlocker(blockers, {
      type: mapCompanyBlockerType(blocker.type),
      severity: blocker.canBeResolved ? 'HIGH' : 'CRITICAL',
      description: blocker.description,
      source: 'company_fit',
    });
  }

  for (const blocker of result.riskAnalysis.criticalBlockers ?? []) {
    if (typeof blocker === 'string') {
      addDecisionBlocker(blockers, {
        type: 'other',
        severity: 'CRITICAL',
        description: blocker,
        source: 'risk',
      });
      continue;
    }

    addDecisionBlocker(blockers, {
      type: mapRiskBlockerType(blocker.type),
      severity: blocker.canBeResolved ? 'HIGH' : 'CRITICAL',
      description: blocker.description,
      source: 'risk',
    });
  }

  addBidDecisionBlockers(blockers, result.bidNoBidDecision);

  result.decisionFactors = {
    ...(result.decisionFactors ?? {}),
    criticalBlockers: compactDecisionBlockers(blockers),
  };
}

function normalizeRiskCriticalBlockers(result: TenderDeepAnalysisResult): void {
  const riskAnalysis = result.riskAnalysis as unknown as Record<
    string,
    unknown
  >;
  const risks = [
    ...extractRiskItems(result.riskAnalysis.tenderRisks),
    ...extractRiskItems(result.riskAnalysis.companySpecificRisks),
    ...extractRiskItems(riskAnalysis.risks),
    ...extractRiskItems(
      (result.riskAnalysis as unknown as { criticalRisks?: unknown })
        .criticalRisks,
    ),
  ];

  for (const risk of risks) {
    const severity = normalizeRiskSeverity(risk.severity);

    if (severity !== 'CRITICAL' && severity !== 'HIGH') {
      continue;
    }

    const description = getRiskDescription(risk);

    if (!description) {
      continue;
    }

    addRiskCriticalBlocker(result.riskAnalysis.criticalBlockers, {
      type: mapRiskAnalysisBlockerType(
        String(risk.type ?? risk.category ?? 'other'),
      ),
      description,
      canBeResolved: severity !== 'CRITICAL',
      resolutionAction:
        typeof risk.mitigation === 'string' ? risk.mitigation : undefined,
    });
  }
}

function applyDocumentationAndClarity(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  const documentAccessUrls = collectTenderDocumentAccessUrls(input.tender);
  const missingDocuments = normalizeMissingDocuments(
    result.documentationAnalysis.missingDocuments,
    {
      ...documentAccessUrls,
      analyzedDocumentNames: collectAnalyzedDocumentNames(input),
    },
  );
  result.documentationAnalysis.missingDocuments = missingDocuments;
  const hasMissingProcurementDocs =
    missingDocuments.length > 0 ||
    input.derived.documentUrlsCount > input.derived.documentsAnalyzedCount;
  const procurementDocumentsAccess =
    documentAccessUrls.directFileUrls.length > 0
      ? 'DIRECT_LINK_AVAILABLE'
      : documentAccessUrls.portalUrls.length > 0
        ? 'PORTAL_LINK_AVAILABLE'
        : hasMissingProcurementDocs
          ? 'MISSING'
          : 'UNKNOWN';
  const noticeCoverageScore =
    input.derived.documentsAnalyzedCount > 0
      ? 80
      : result.documentationAnalysis.documentsAvailable
        ? 60
        : 30;
  const procurementPackageCoverageScore = hasMissingProcurementDocs ? 0 : 70;
  const technicalSpecCoverageScore = hasMissingProcurementDocs ? 0 : 60;
  const hasClearNoGo =
    result.finalRecommendation.value === 'no_go' &&
    (result.decisionFactors?.criticalBlockers.length ?? 0) > 0;
  const bidPreparationSufficiencyScore = hasMissingProcurementDocs ? 10 : 80;
  const goNoGoDecisionSufficiencyScore = hasClearNoGo
    ? 90
    : hasMissingProcurementDocs
      ? 60
      : 80;
  const overallDocumentationCompletenessScore = clampRound(
    noticeCoverageScore * 0.35 +
      procurementPackageCoverageScore * 0.3 +
      technicalSpecCoverageScore * 0.25 +
      goNoGoDecisionSufficiencyScore * 0.1,
  );

  result.documentationScores = {
    noticeCoverageScore,
    procurementPackageCoverageScore,
    technicalSpecCoverageScore,
    bidPreparationSufficiencyScore,
    goNoGoDecisionSufficiencyScore,
    overallDocumentationCompletenessScore,
  };
  result.documentationAnalysis.documentationCompletenessScore =
    overallDocumentationCompletenessScore;
  result.documentationAnalysis.missingDocumentsWarning =
    hasMissingProcurementDocs;
  result.documentationAnalysis.noticeDocumentsAnalyzedCount =
    input.derived.documentsAnalyzedCount;
  const procurementDocumentsAnalyzedCount = 0;
  result.documentationAnalysis.procurementDocumentsAnalyzedCount =
    procurementDocumentsAnalyzedCount;
  result.documentationAnalysis.procurementDocumentsAvailable =
    procurementDocumentsAccess !== 'MISSING' &&
    procurementDocumentsAccess !== 'UNKNOWN';
  result.documentationAnalysis.procurementDocumentsAccess =
    procurementDocumentsAccess;
  result.documentationAnalysis.documentsAnalyzedCount =
    input.derived.documentsAnalyzedCount + procurementDocumentsAnalyzedCount;
  result.documentationAnalysis.documentsTotalCount = Math.max(
    input.derived.documentUrlsCount,
    result.documentationAnalysis.documentsAnalyzedCount,
    missingDocuments.length,
  );
  delete (
    result.documentationAnalysis as unknown as {
      missingDocumentsImpactOnDecision?: unknown;
    }
  ).missingDocumentsImpactOnDecision;
  result.decisionFactors ||= { criticalBlockers: [] };
  result.decisionFactors.missingDocumentsImpact = {
    impactOnBidPreparation: hasMissingProcurementDocs ? 'HIGH' : 'LOW',
    impactOnGoNoGoDecision: hasClearNoGo
      ? 'LOW'
      : hasMissingProcurementDocs
        ? 'HIGH'
        : 'LOW',
  };

  const noticeLevelClarityScore = 75;
  const technicalSpecificationClarityScore = hasMissingProcurementDocs
    ? 20
    : 65;
  const selectionCriteriaClarityScore =
    hasMissingProcurementDocs || hasSelectionCriteriaGap(result, input)
      ? 25
      : 60;
  const goNoGoDecisionClarityScore = hasClearNoGo ? 90 : 65;

  result.requirementsClarity = {
    noticeLevelClarityScore,
    technicalSpecificationClarityScore,
    selectionCriteriaClarityScore,
    goNoGoDecisionClarityScore,
  };
  result.scores.requirementsClarityScore = clampRound(
    noticeLevelClarityScore * 0.35 +
      technicalSpecificationClarityScore * 0.25 +
      selectionCriteriaClarityScore * 0.2 +
      goNoGoDecisionClarityScore * 0.2,
  );
}

function applyProcedureConsistency(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  if (input.tender.procedureType !== 'neg-w-call') {
    return;
  }

  const tenderIntelligence = result.tenderIntelligence as unknown as {
    procedureType?: unknown;
    procedureDescription?: unknown;
  };
  const ambiguousProcedure =
    'Ambiguous/restricted negotiated procedure (structured TED: neg-w-call; notice text may indicate request-to-participate or invited-bidder stage).';

  tenderIntelligence.procedureType = ambiguousProcedure;
  (
    tenderIntelligence as unknown as {
      procedureAccess?: string;
    }
  ).procedureAccess = 'restricted_or_subject_to_preselection';

  if (typeof tenderIntelligence.procedureDescription === 'string') {
    tenderIntelligence.procedureDescription = ambiguousProcedure;
  }
}

function applyFinalRecommendationConsistency(
  result: TenderDeepAnalysisResult,
): void {
  const finalRecommendation = result.finalRecommendation as unknown as {
    fitScoreThreshold?: unknown;
  };

  if (typeof finalRecommendation.fitScoreThreshold === 'string') {
    finalRecommendation.fitScoreThreshold =
      'Fit score is below the no-go threshold of 30, and critical blockers are present.';
  }
}

function getRecommendationConfidence(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): number {
  const explicitConfidence =
    result.finalRecommendation.confidenceScore ??
    (result.finalRecommendation as unknown as { confidence?: unknown })
      .confidence ??
    result.confidence.recommendationConfidence;

  if (typeof explicitConfidence === 'number' && explicitConfidence > 0) {
    return clampRound(explicitConfidence);
  }

  const blockers = result.companyFitAnalysis.criticalBlockers ?? [];
  const hasUnresolvedBlocker = blockers.some(
    (blocker) => blocker.canBeResolved === false,
  );

  if (input.derived.isDeadlineExpired || hasUnresolvedBlocker) {
    return 95;
  }

  if (result.finalRecommendation.value === 'no_go') {
    return result.scores.fitScore < 30 ? 90 : 85;
  }

  return clampRound(result.companyFitAnalysis.confidenceScore || 80);
}

function calculateRiskLevelScore(result: TenderDeepAnalysisResult): number {
  const existingRiskScore = clampRound(result.riskAnalysis.riskScore);

  if (existingRiskScore > 0) {
    return existingRiskScore;
  }

  const blockers = result.decisionFactors?.criticalBlockers ?? [];

  if (blockers.some((blocker) => blocker.severity === 'CRITICAL')) {
    return 95;
  }

  if (blockers.some((blocker) => blocker.severity === 'HIGH')) {
    return 85;
  }

  if (result.finalRecommendation.value === 'no_go') {
    return 80;
  }

  return 50;
}

function calculateTenderDataConfidence(
  input: TenderDeepCompanyFitAnalysisInput,
): number {
  const totalDocuments = input.derived.documentUrlsCount;
  const analyzedDocuments = input.derived.documentsAnalyzedCount;

  if (totalDocuments > 0 && analyzedDocuments === 0) {
    return 60;
  }

  if (totalDocuments > analyzedDocuments) {
    return 70;
  }

  if (analyzedDocuments > 0) {
    return 85;
  }

  return 70;
}

function calculateCompanyProfileConfidence(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): number {
  let confidence = 85;

  if (!input.company.companyDescription) confidence -= 10;
  if (!input.company.capabilities || input.company.capabilities.length === 0) {
    confidence -= 10;
  }
  if (
    input.company.industries.length === 0 &&
    input.company.mainServices.length === 0
  ) {
    confidence -= 20;
  } else if (hasOnlyWeakCpvRefs(input.company)) {
    confidence -= 15;
  }
  if (input.company.operatingCountries.length === 0) confidence -= 5;
  if (input.company.languages.length === 0) confidence -= 5;
  if (!hasTypicalContractSize(input.company)) confidence -= 5;
  if (input.derived.preliminarySignals.cpvOverlap === false) confidence -= 10;

  confidence -= Math.min(
    10,
    result.companyFitAnalysis.missingCompanyInformation.length * 2,
  );

  return clampRound(confidence);
}

function calculateScoringConfidence(
  recommendationConfidence: number,
  tenderDataConfidence: number,
  companyProfileConfidence: number,
  result: TenderDeepAnalysisResult,
): number {
  const evidencePenalty =
    result.companyFitAnalysis.missingTenderInformation.length > 0 ? 5 : 0;

  return clampRound(
    recommendationConfidence * 0.25 +
      tenderDataConfidence * 0.35 +
      companyProfileConfidence * 0.35 +
      clampRound(result.documentationAnalysis.documentationCompletenessScore) *
        0.05 -
      evidencePenalty,
  );
}

function hasOnlyWeakCpvRefs(company: CompanyAnalysisDto): boolean {
  const refs = [...company.industries, ...company.mainServices];

  return (
    refs.length > 0 &&
    refs.every((ref) => !ref.code && !ref.name && !ref.description)
  );
}

function addBidDecisionBlockers(
  blockers: NonNullable<
    TenderDeepAnalysisResult['decisionFactors']
  >['criticalBlockers'],
  bidNoBidDecision: TenderDeepAnalysisResult['bidNoBidDecision'],
): void {
  const decision = bidNoBidDecision as unknown as {
    criticalBlockers?: unknown;
    decisionFactors?: {
      criticalBlockers?: unknown;
    };
  };

  for (const value of [
    decision.criticalBlockers,
    decision.decisionFactors?.criticalBlockers,
  ]) {
    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (typeof item === 'string') {
        addDecisionBlocker(blockers, {
          type: 'other',
          severity: 'HIGH',
          description: item,
          source: 'bid_decision',
        });
        continue;
      }

      if (!isRecord(item) || typeof item.description !== 'string') {
        continue;
      }

      addDecisionBlocker(blockers, {
        type: normalizeDecisionBlockerType(item.type),
        severity: normalizeDecisionBlockerSeverity(item.severity),
        description: item.description,
        source: 'bid_decision',
      });
    }
  }
}

function addDecisionBlocker(
  blockers: NonNullable<
    TenderDeepAnalysisResult['decisionFactors']
  >['criticalBlockers'],
  blocker: NonNullable<
    TenderDeepAnalysisResult['decisionFactors']
  >['criticalBlockers'][number],
): void {
  if (
    typeof blocker.description !== 'string' ||
    blocker.description.trim() === ''
  ) {
    return;
  }

  const normalized = blocker.description.trim().toLowerCase();

  if (
    blockers.some(
      (existing) =>
        typeof existing.description === 'string' &&
        existing.description.trim().toLowerCase() === normalized,
    )
  ) {
    return;
  }

  blockers.push(blocker);
}

function addRiskCriticalBlocker(
  blockers: TenderDeepAnalysisResult['riskAnalysis']['criticalBlockers'],
  blocker: TenderDeepAnalysisResult['riskAnalysis']['criticalBlockers'][number],
): void {
  if (!blocker.description.trim()) {
    return;
  }

  const normalized = blocker.description.trim().toLowerCase();

  if (
    blockers.some(
      (existing) => existing.description.trim().toLowerCase() === normalized,
    )
  ) {
    return;
  }

  blockers.push(blocker);
}

function extractRiskItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function normalizeRiskSeverity(value: unknown): string {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';

  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(normalized)) {
    return normalized;
  }

  return '';
}

function getRiskDescription(risk: Record<string, unknown>): string | null {
  return typeof risk.description === 'string' && risk.description.trim()
    ? risk.description.trim()
    : null;
}

function compactDecisionBlockers(
  blockers: NonNullable<
    TenderDeepAnalysisResult['decisionFactors']
  >['criticalBlockers'],
): NonNullable<
  TenderDeepAnalysisResult['decisionFactors']
>['criticalBlockers'] {
  const byType = new Map<
    NonNullable<
      TenderDeepAnalysisResult['decisionFactors']
    >['criticalBlockers'][number]['type'],
    NonNullable<
      TenderDeepAnalysisResult['decisionFactors']
    >['criticalBlockers'][number]
  >();
  const otherBlockers: NonNullable<
    TenderDeepAnalysisResult['decisionFactors']
  >['criticalBlockers'] = [];

  for (const blocker of blockers) {
    if (
      typeof blocker.description !== 'string' ||
      blocker.description.trim() === ''
    ) {
      continue;
    }

    if (blocker.type === 'other') {
      otherBlockers.push(blocker);
      continue;
    }

    const current = byType.get(blocker.type);

    if (
      !current ||
      severityRank(blocker.severity) > severityRank(current.severity)
    ) {
      byType.set(blocker.type, blocker);
    }
  }

  const order: Array<
    NonNullable<
      TenderDeepAnalysisResult['decisionFactors']
    >['criticalBlockers'][number]['type']
  > = [
    'eligibility',
    'capability',
    'certification',
    'geography',
    'financial',
    'legal',
    'deadline',
    'language',
  ];

  return [
    ...order
      .map((type) => byType.get(type))
      .filter(
        (
          blocker,
        ): blocker is NonNullable<
          TenderDeepAnalysisResult['decisionFactors']
        >['criticalBlockers'][number] => Boolean(blocker),
      ),
    ...otherBlockers,
  ]
    .map((blocker) => ({
      ...blocker,
      severity:
        blocker.type === 'capability' || blocker.type === 'certification'
          ? 'CRITICAL'
          : blocker.severity,
    }))
    .slice(0, 5);
}

function normalizeDecisionBlockerType(
  value: unknown,
): NonNullable<
  TenderDeepAnalysisResult['decisionFactors']
>['criticalBlockers'][number]['type'] {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (
    [
      'capability',
      'certification',
      'geography',
      'eligibility',
      'deadline',
      'language',
      'financial',
      'legal',
      'other',
    ].includes(normalized)
  ) {
    return normalized as NonNullable<
      TenderDeepAnalysisResult['decisionFactors']
    >['criticalBlockers'][number]['type'];
  }

  return 'other';
}

function normalizeDecisionBlockerSeverity(
  value: unknown,
): NonNullable<
  TenderDeepAnalysisResult['decisionFactors']
>['criticalBlockers'][number]['severity'] {
  const normalized = typeof value === 'string' ? value.toUpperCase() : 'HIGH';

  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(normalized)) {
    return normalized as NonNullable<
      TenderDeepAnalysisResult['decisionFactors']
    >['criticalBlockers'][number]['severity'];
  }

  return 'HIGH';
}

function severityRank(severity: string): number {
  if (severity === 'CRITICAL') return 4;
  if (severity === 'HIGH') return 3;
  if (severity === 'MEDIUM') return 2;
  return 1;
}

function cleanupCompanyFitAnalysis(result: TenderDeepAnalysisResult): void {
  const mutable = result.companyFitAnalysis as unknown as Record<
    string,
    unknown
  >;

  for (const key of [
    'strengths',
    'weaknesses',
    'gaps',
    'criticalBlockers',
    'missingTenderInformation',
  ]) {
    if (Array.isArray(mutable[key]) && mutable[key].length === 0) {
      delete mutable[key];
    }
  }
}

function applyUserFacingScoreExplanations(
  result: TenderDeepAnalysisResult,
): void {
  const scoreBreakdown = getScoreBreakdownRecord(result);

  for (const key of SCORE_KEYS) {
    const item = scoreBreakdown[key];

    if (!item) {
      continue;
    }

    if (isTechnicalScoreExplanation(item.explanation)) {
      item.explanation = buildScoreExplanationFallback(key, item);
    }

    item.evidence = normalizeStringList(item.evidence);
    item.missingInformation = normalizeStringList(item.missingInformation);
  }

  applyScoreBreakdown(result);
}

function isTechnicalScoreExplanation(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

function buildScoreExplanationFallback(
  key: CompanyFitScoreKey,
  item: {
    score: number;
    evidence?: unknown;
    missingInformation?: unknown;
  },
): string {
  const evidence = normalizeStringList(item.evidence);
  const missingInformation = normalizeStringList(item.missingInformation);

  if (evidence.length > 0) {
    return evidence.join('; ');
  }

  if (missingInformation.length > 0) {
    return missingInformation.join('; ');
  }

  return `${key}: ${clampRound(item.score)}/100`;
}

function applyCompanyFitSummaryFields(result: TenderDeepAnalysisResult): void {
  const mutable = result.companyFitAnalysis as unknown as Record<
    string,
    unknown
  >;

  if (!Array.isArray(mutable.strengths) || mutable.strengths.length === 0) {
    mutable.strengths = [];
  }

  if (!Array.isArray(mutable.weaknesses) || mutable.weaknesses.length === 0) {
    mutable.weaknesses = [];
  }

  if (
    !Array.isArray(mutable.capabilityGaps) ||
    mutable.capabilityGaps.length === 0
  ) {
    mutable.capabilityGaps = [];
  }

  mutable.missingCompanyInformation = normalizeMissingCompanyInformation(
    mutable.missingCompanyInformation,
  );
}

function syncDocumentationScores(result: TenderDeepAnalysisResult): void {
  const documentationAnalysis =
    result.documentationAnalysis as unknown as Record<string, unknown>;

  documentationAnalysis.documentationScores = result.documentationScores;
  delete documentationAnalysis.missingDocumentsImpact;
  delete documentationAnalysis.missingDocumentsImpactOnDecision;
}

function syncLegacyFitScores(result: TenderDeepAnalysisResult): void {
  const fitScore = result.scores.fitScore;

  result.companyFitAnalysis.fitScore = fitScore;
  (result.bidNoBidDecision as unknown as { fitScore?: number }).fitScore =
    fitScore;
  (result.finalRecommendation as unknown as { fitScore?: number }).fitScore =
    fitScore;
}

function normalizeMissingCompanyInformation(value: unknown): string[] {
  return normalizeStringList(value);
}

function normalizeRiskSeverityLabels(result: TenderDeepAnalysisResult): void {
  normalizeSeverityLabelsInObject(result.riskAnalysis, result.language);
  normalizeSeverityLabelsInObject(result.companyFitAnalysis, result.language);
  normalizeSeverityLabelsInObject(result.decisionFactors, result.language);
}

function normalizeSeverityLabelsInObject(
  value: unknown,
  language?: string,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      normalizeSeverityLabelsInObject(item, language);
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (typeof value.severity === 'string') {
    const normalized = normalizeSeverity(value.severity);
    value.severity = normalized;
    value.severityLabel = getSeverityLabel(normalized, language);
  }

  for (const nestedValue of Object.values(value)) {
    normalizeSeverityLabelsInObject(nestedValue, language);
  }
}

function normalizeSeverity(value: string): string {
  const normalized = value.trim().toUpperCase();

  if (['KRITISCH', 'CRITICAL', 'CRITIQUE', 'CRITICO'].includes(normalized)) {
    return 'CRITICAL';
  }

  if (['HOCH', 'HIGH', 'ALTO', 'ELEVEE', 'ÉLEVÉE'].includes(normalized)) {
    return 'HIGH';
  }

  if (['MITTEL', 'MEDIUM', 'MEDIO', 'MOYEN'].includes(normalized)) {
    return 'MEDIUM';
  }

  if (['NIEDRIG', 'LOW', 'BAJO', 'FAIBLE'].includes(normalized)) {
    return 'LOW';
  }

  return normalized;
}

function getSeverityLabel(value: string, language?: string): string {
  if (language === 'DEU' || language?.toLowerCase().startsWith('de')) {
    const labels: Record<string, string> = {
      CRITICAL: 'Kritisch',
      HIGH: 'Hoch',
      MEDIUM: 'Mittel',
      LOW: 'Niedrig',
    };

    return labels[value] ?? value;
  }

  const labels: Record<string, string> = {
    CRITICAL: 'Critical',
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
  };

  return labels[value] ?? value;
}

function removeEmptyScoreEvidence(result: TenderDeepAnalysisResult): void {
  for (const item of result.scores.scoreBreakdown ?? []) {
    const mutable = item as unknown as Record<string, unknown>;

    if (Array.isArray(mutable.evidence) && mutable.evidence.length === 0) {
      delete mutable.evidence;
    }

    if (
      Array.isArray(mutable.missingInformation) &&
      mutable.missingInformation.length === 0
    ) {
      delete mutable.missingInformation;
    }
  }
}

function normalizeEvidenceMap(result: TenderDeepAnalysisResult): void {
  const rawItems = Array.isArray(result.evidenceMap) ? result.evidenceMap : [];

  result.evidenceMap = rawItems
    .map((item): TenderDeepAnalysisResult['evidenceMap'][number] | null => {
      if (!isRecord(item)) {
        return null;
      }

      const claim =
        getNonEmptyString(item.claim) ??
        getNonEmptyString(item.description) ??
        getNonEmptyString(item.reference) ??
        getNonEmptyString(item.source);

      if (!claim) {
        return null;
      }

      return {
        claim,
        evidenceSource: normalizeEvidenceSource(
          item.evidenceSource ?? item.source,
        ),
        fieldName: getNonEmptyString(item.fieldName),
        documentName:
          getNonEmptyString(item.documentName) ??
          getNonEmptyString(item.reference),
        evidenceText:
          getNonEmptyString(item.evidenceText) ??
          getNonEmptyString(item.excerpt) ??
          getNonEmptyString(item.description),
        confidence: normalizeEvidenceConfidence(item.confidence),
      };
    })
    .filter(
      (item): item is TenderDeepAnalysisResult['evidenceMap'][number] =>
        item !== null,
    );
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeEvidenceSource(
  value: unknown,
): TenderDeepAnalysisResult['evidenceMap'][number]['evidenceSource'] {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (
    [
      'structured_ted',
      'tender_document',
      'general_analysis',
      'company_profile',
      'derived',
      'missing',
    ].includes(normalized)
  ) {
    return normalized as TenderDeepAnalysisResult['evidenceMap'][number]['evidenceSource'];
  }

  return 'missing';
}

function normalizeEvidenceConfidence(
  value: unknown,
): TenderDeepAnalysisResult['evidenceMap'][number]['confidence'] {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (['high', 'medium', 'low'].includes(normalized)) {
    return normalized as TenderDeepAnalysisResult['evidenceMap'][number]['confidence'];
  }

  return 'medium';
}

function normalizeRequirementsClarityFields(
  result: TenderDeepAnalysisResult,
): void {
  const requirementsAnalysis = result.requirementsAnalysis as unknown as Record<
    string,
    unknown
  >;

  if (result.requirementsClarity) {
    requirementsAnalysis.technicalRequirementsClarityScore =
      result.requirementsClarity.technicalSpecificationClarityScore;
  }

  delete requirementsAnalysis.requirementsClarityScore;
}

function mapCompanyBlockerType(
  type: string,
): NonNullable<
  TenderDeepAnalysisResult['decisionFactors']
>['criticalBlockers'][number]['type'] {
  const normalized = type.trim().toLowerCase();
  const mapping: Record<
    string,
    NonNullable<
      TenderDeepAnalysisResult['decisionFactors']
    >['criticalBlockers'][number]['type']
  > = {
    capability: 'capability',
    capability_gap: 'capability',
    company_fit: 'capability',
    experience: 'capability',
    reference: 'capability',
    references: 'capability',
    scope: 'capability',
    scope_mismatch: 'capability',
    certification: 'certification',
    certification_gap: 'certification',
    geographic: 'geography',
    geography: 'geography',
    geographic_gap: 'geography',
    location: 'geography',
    eligibility: 'eligibility',
    mandatory: 'eligibility',
    mandatory_requirement: 'eligibility',
    requirement: 'eligibility',
    deadline: 'deadline',
    language: 'language',
    financial: 'financial',
    legal: 'legal',
  };

  return mapping[normalized] ?? 'other';
}

function mapRiskBlockerType(
  type: string,
): NonNullable<
  TenderDeepAnalysisResult['decisionFactors']
>['criticalBlockers'][number]['type'] {
  const normalized = type.trim().toLowerCase();
  const mapping: Record<
    string,
    NonNullable<
      TenderDeepAnalysisResult['decisionFactors']
    >['criticalBlockers'][number]['type']
  > = {
    capability: 'capability',
    company_fit: 'capability',
    experience: 'capability',
    operational: 'capability',
    scope: 'capability',
    unclear_scope: 'capability',
    certification: 'certification',
    eligibility: 'eligibility',
    mandatory_requirement: 'eligibility',
    language: 'language',
    financial: 'financial',
    legal: 'legal',
    contractual: 'legal',
    deadline: 'deadline',
    expired_deadline: 'deadline',
  };

  return mapping[normalized] ?? 'other';
}

function mapRiskAnalysisBlockerType(
  type: string,
): TenderDeepAnalysisResult['riskAnalysis']['criticalBlockers'][number]['type'] {
  const normalized = type.trim().toLowerCase();
  const mapping: Record<
    string,
    TenderDeepAnalysisResult['riskAnalysis']['criticalBlockers'][number]['type']
  > = {
    deadline: 'expired_deadline',
    expired_deadline: 'expired_deadline',
    documentation: 'missing_documents',
    missing_documents: 'missing_documents',
    scope: 'unclear_scope',
    unclear_scope: 'unclear_scope',
    certification: 'mandatory_requirement',
    eligibility: 'mandatory_requirement',
    mandatory_requirement: 'mandatory_requirement',
    requirement: 'mandatory_requirement',
    language: 'language',
    legal: 'legal',
    contractual: 'legal',
    financial: 'financial',
    commercial: 'financial',
    budget: 'financial',
    capability: 'company_fit',
    company_fit: 'company_fit',
    delivery: 'company_fit',
    experience: 'company_fit',
    operational: 'company_fit',
  };

  return mapping[normalized] ?? 'other';
}

function hasSelectionCriteriaGap(
  result: TenderDeepAnalysisResult,
  input?: TenderDeepCompanyFitAnalysisInput,
): boolean {
  if (input) {
    return !input.derived.hasSelectionCriteria;
  }

  const requirements = result.requirementsAnalysis as unknown as Record<
    string,
    unknown
  >;
  const selectionCriteria = requirements?.selectionCriteria;
  const eligibilityCriteria = requirements?.eligibilityCriteria;

  if (Array.isArray(selectionCriteria)) {
    return selectionCriteria.length === 0;
  }

  if (Array.isArray(eligibilityCriteria)) {
    return eligibilityCriteria.length === 0;
  }

  return selectionCriteria === undefined && eligibilityCriteria === undefined;
}

function applyMissingCompanyInfo(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  const missing: string[] = [];

  if (!input.company.companyDescription) {
    missing.push('Company description is missing.');
  }

  if (
    input.company.industries.length === 0 &&
    input.company.mainServices.length === 0
  ) {
    missing.push(
      'Company industries and main services are missing or not populated.',
    );
  }

  if (!input.company.capabilities || input.company.capabilities.length === 0) {
    missing.push('No company capabilities are declared.');
  }

  if (input.company.operatingCountries.length === 0) {
    missing.push('Company operating regions are missing.');
  }

  if (input.company.languages.length === 0) {
    missing.push('Company languages are missing.');
  }

  if (!hasTypicalContractSize(input.company)) {
    missing.push('Typical contract size is missing.');
  }

  for (const item of missing) {
    addUnique(result.companyFitAnalysis.missingCompanyInformation, item);
  }

  result.companyFitAnalysis.confidenceScore = clampRound(
    result.companyFitAnalysis.confidenceScore,
  );

  if (missing.length >= 5) {
    result.companyFitAnalysis.confidenceScore = Math.min(
      result.companyFitAnalysis.confidenceScore,
      45,
    );
  } else if (missing.length >= 3) {
    result.companyFitAnalysis.confidenceScore = Math.min(
      result.companyFitAnalysis.confidenceScore,
      60,
    );
  }
}

function applyGuardrails(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  if (
    input.company.languages.length === 0 &&
    (input.tender.submissionLanguages?.length ?? 0) > 0
  ) {
    capCriterion(result, 'languageFit', 50);
    addUnique(
      result.companyFitAnalysis.missingCompanyInformation,
      'Company languages are missing.',
    );
  }

  if (
    input.company.operatingCountries.length === 0 &&
    ((input.tender.placeOfPerformanceCountries?.length ?? 0) > 0 ||
      Boolean(input.tender.buyerCountry))
  ) {
    capCriterion(result, 'geographicFit', 50);
    addUnique(
      result.companyFitAnalysis.missingCompanyInformation,
      'Company operating regions are missing.',
    );
  }

  if (!hasTypicalContractSize(input.company) && input.tender.estimatedValue) {
    capCriterion(result, 'financialFit', 60);
    addUnique(
      result.companyFitAnalysis.missingCompanyInformation,
      'Typical contract size is missing.',
    );
  }

  if (
    containsRequiredCertification(
      result.requirementsAnalysis?.mandatoryRequirements,
    ) &&
    (!input.company.certifications || input.company.certifications.length === 0)
  ) {
    capCriterion(result, 'certificationFit', 50);
    result.companyFitAnalysis.gaps.push({
      category: 'certification',
      severity: 'high',
      description:
        'Required tender certifications are present, but no company certifications are declared or provided.',
      mustResolveBeforeBid: true,
    });
  }

  if (input.company.publicProcurementExperience === false) {
    addUnique(
      result.companyFitAnalysis.weaknesses,
      'Company has no indicated public procurement experience.',
    );
    result.riskAnalysis.companySpecificRisks.push({
      id: 'company-public-procurement-experience',
      category: 'company_fit',
      severity: 'medium',
      probability: 'medium',
      description: 'Company has no indicated public procurement experience.',
      businessImpact:
        'The bid team may need stronger partner references, more administrative review, or clearer evidence of public-sector delivery readiness.',
      evidence: ['company_profile.publicProcurementExperience=false'],
    });
  }

  if (input.derived.isDeadlineExpired) {
    getScoreBreakdownRecord(result).deadlineFit.score = 0;
    if (
      !result.companyFitAnalysis.criticalBlockers.some(
        (blocker) => blocker.type === 'expired_deadline',
      )
    ) {
      result.companyFitAnalysis.criticalBlockers.push({
        type: 'expired_deadline',
        description: 'The tender submission deadline has expired.',
        canBeResolved: false,
      });
    }
    if (
      !result.riskAnalysis.criticalBlockers.some(
        (blocker) => blocker.type === 'expired_deadline',
      )
    ) {
      result.riskAnalysis.criticalBlockers.push({
        type: 'expired_deadline',
        description: 'The tender submission deadline has expired.',
        canBeResolved: false,
      });
    }
  }

  if (input.derived.documentUrlsCount > input.derived.documentsAnalyzedCount) {
    result.documentationAnalysis.missingDocumentsWarning = true;
    result.documentationAnalysis.documentationCompletenessScore = Math.min(
      clampRound(result.documentationAnalysis.documentationCompletenessScore),
      50,
    );
    result.companyFitAnalysis.confidenceScore = Math.min(
      clampRound(result.companyFitAnalysis.confidenceScore),
      70,
    );
  }
}

function capCriterion(
  result: TenderDeepAnalysisResult,
  key: CompanyFitScoreKey,
  maxScore: number,
): void {
  const criterion = getScoreBreakdownRecord(result)[key];
  criterion.score = Math.min(clampRound(criterion.score), maxScore);
}

function containsRequiredCertification(
  requirements?: TenderRequirement[],
): boolean {
  return (
    requirements?.some(
      (requirement) =>
        requirement.mandatoryLevel === 'mandatory' &&
        (requirement.category === 'certification' ||
          /certificat|certification|iso|standard/i.test(
            requirement.requirement,
          )),
    ) ?? false
  );
}

function mapRecommendationToBidDecision(
  recommendation: TenderDeepRecommendation,
): BidNoBidDecision {
  if (recommendation === 'strong_go') {
    return 'strong_bid';
  }

  if (recommendation === 'go') {
    return 'bid';
  }

  if (recommendation === 'investigate' || recommendation === 'caution') {
    return 'bid_if_gaps_resolved';
  }

  if (recommendation === 'not_actionable') {
    return 'not_actionable';
  }

  return 'no_bid';
}

function getCpvOverlap(
  tender: Tender,
  company: CompanyAnalysisDto,
): boolean | undefined {
  const tenderCodes = extractCpvCodes(tender);
  const companyRefs = [...company.industries, ...company.mainServices];
  const companyCodes = companyRefs
    .map((ref) => ref.code)
    .filter((code): code is string => Boolean(code));

  if (tenderCodes.length === 0 || companyRefs.length === 0) {
    return undefined;
  }

  if (companyCodes.length === 0) {
    return undefined;
  }

  return tenderCodes.some((code) => companyCodes.includes(code));
}

function getCountryOverlap(
  tender: Tender,
  company: CompanyAnalysisDto,
): boolean | undefined {
  const tenderCountries = [
    ...(tender.placeOfPerformanceCountries ?? []),
    ...(tender.buyerCountry ? [tender.buyerCountry] : []),
  ].map(normalizeComparable);
  const companyCountries = [
    ...company.operatingCountries,
    ...(company.country ? [company.country] : []),
  ].map(normalizeComparable);

  if (tenderCountries.length === 0) {
    return undefined;
  }

  return tenderCountries.some((country) => companyCountries.includes(country));
}

function getLanguageOverlap(
  tender: Tender,
  company: CompanyAnalysisDto,
): boolean | undefined {
  const tenderLanguages =
    tender.submissionLanguages && tender.submissionLanguages.length > 0
      ? tender.submissionLanguages
      : tender.noticeLanguage
        ? [tender.noticeLanguage]
        : [];

  if (tenderLanguages.length === 0) {
    return undefined;
  }

  const companyLanguages = company.languages.map(normalizeComparable);

  return tenderLanguages
    .map(normalizeComparable)
    .some((language) => companyLanguages.includes(language));
}

function getEstimatedValueWithinCompanyRange(
  tender: Tender,
  company: CompanyAnalysisDto,
): boolean | null {
  const amount = tender.estimatedValue?.amount;
  const currency = tender.estimatedValue?.currency;
  const range = company.typicalContractSize;

  if (
    typeof amount !== 'number' ||
    !range ||
    (typeof range.min !== 'number' && typeof range.max !== 'number')
  ) {
    return null;
  }

  if (currency && range.currency && currency !== range.currency) {
    return null;
  }

  if (typeof range.min === 'number' && amount < range.min) {
    return false;
  }

  if (typeof range.max === 'number' && amount > range.max) {
    return false;
  }

  return true;
}

function extractCpvCodes(tender: Tender): string[] {
  return Array.from(
    new Set(
      [
        ...(tender.cpvCodes ?? []),
        ...(tender.classificationCpv ?? []),
        ...(tender.mainClassificationProc ?? []),
        ...(tender.mainClassificationLot ?? []),
        ...(tender.additionalClassificationLot ?? []),
      ]
        .map((item) => extractCpvCode(item))
        .filter((code): code is string => Boolean(code)),
    ),
  );
}

function buildLotDto(lot: TenderLot) {
  return {
    ...lot,
    deadlineReceiptTender: formatDate(lot.deadlineReceiptTender),
  };
}

function countTenderDocumentUrls(tender: Tender): number {
  const urls = [
    ...(tender.documentUrls ?? []),
    ...(tender.lots?.flatMap((lot) => lot.documentUrls ?? []) ?? []),
  ];

  return new Set(
    urls
      .map((url) => url.trim().toLowerCase())
      .filter((url) => /^https?:\/\//i.test(url)),
  ).size;
}

function extractCpvCode(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const code = record.code ?? record.cpvCode ?? record.value;

  return typeof code === 'string' ? code : undefined;
}

function getValueBand(
  amount?: number | null,
): TenderCompanyFitDerivedMetadata['valueBand'] {
  if (typeof amount !== 'number') {
    return 'unknown';
  }

  if (amount < 10_000) return 'micro';
  if (amount < 100_000) return 'small';
  if (amount < 1_000_000) return 'medium';
  if (amount < 10_000_000) return 'large';
  return 'enterprise';
}

function getDeadlineUrgency(
  days: number | null,
  expired: boolean,
): TenderCompanyFitDerivedMetadata['deadlineUrgency'] {
  if (expired) return 'expired';
  if (days === null) return 'unknown';
  if (days <= 3) return 'critical';
  if (days <= 10) return 'short';
  if (days <= 30) return 'normal';
  return 'long';
}

function daysUntil(value: Date | undefined, now: Date): number | null {
  if (!value) {
    return null;
  }

  return Math.ceil((value.getTime() - now.getTime()) / 86_400_000);
}

function formatDate(value?: Date): string | undefined {
  return value?.toISOString();
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase();
}

function hasTypicalContractSize(company: CompanyAnalysisDto): boolean {
  return Boolean(
    company.typicalContractSize &&
    (typeof company.typicalContractSize.min === 'number' ||
      typeof company.typicalContractSize.max === 'number'),
  );
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function clampRound(value: unknown): number {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        typeof value === 'number' && Number.isFinite(value) ? value : 0,
      ),
    ),
  );
}

function clampScore(value: unknown): number {
  return Math.max(
    0,
    Math.min(
      100,
      typeof value === 'number' && Number.isFinite(value) ? value : 0,
    ),
  );
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
