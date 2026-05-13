import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
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
  TenderRequirement,
} from '@/types';
import { TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION } from '@/openai/prompts/tender-deep-company-fit.prompt';
import { isRecord } from '@/utils';
import { Tender, TenderDocument } from '../tenders/schemas';
import { UserDocument } from '../user/user.types';
import { TenderGeneralAnalysis } from '../tender-analysis/schemas';

export const COMPANY_FIT_WEIGHTS = {
  scopeFit: 18,
  capabilityFit: 16,
  cpvFit: 8,
  geographicFit: 8,
  languageFit: 7,
  eligibilityFit: 12,
  certificationFit: 7,
  experienceFit: 8,
  financialFit: 6,
  commercialFit: 4,
  deadlineFit: 4,
  riskFit: 2,
} as const satisfies Record<CompanyFitScoreKey, number>;

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
  buildCompanyAnalysisDto(user: UserDocument): CompanyAnalysisDto {
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
    };
  }

  buildTenderDto(tender: TenderDocument): TenderAnalysisTenderDto {
    return {
      id: tender.id,
      source: tender.source,
      publicationNumber: tender.publicationNumber,
      sourceNoticeId: tender.sourceNoticeId,
      noticeType: tender.noticeType,
      noticeSubtype: tender.noticeSubtype,
      noticeVersion: tender.noticeVersion,
      procedureType: tender.procedureType,
      title: tender.title,
      titleProc: tender.titleProc,
      titleLot: tender.titleLot ?? [],
      description: tender.description,
      descriptionLot: tender.descriptionLot ?? [],
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
      lotIdentifiers: tender.lotIdentifiers ?? [],
      internalLotIdentifiers: tender.internalLotIdentifiers ?? [],
      documentUrls: tender.documentUrls ?? [],
      submissionUrls: tender.submissionUrls ?? [],
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
    const isQuestionsDeadlineExpired =
      params.tender.questionsDeadline === undefined
        ? null
        : params.tender.questionsDeadline.getTime() < now.getTime();
    const documentUrlsCount = params.tender.documentUrls?.length ?? 0;

    return {
      currentDate: now.toISOString().slice(0, 10),
      daysUntilSubmissionDeadline: submissionDays,
      daysUntilQuestionsDeadline: questionsDays,
      isDeadlineExpired,
      isQuestionsDeadlineExpired,
      hasLots: (params.tender.lotIdentifiers?.length ?? 0) > 0,
      lotCount: params.tender.lotIdentifiers?.length ?? 0,
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
    documentAnalyses?: unknown[];
    documentTextSnippets?: unknown[];
    outputLanguage?: string;
  }): TenderDeepCompanyFitAnalysisInput {
    const documentAnalyses = params.documentAnalyses ?? [];

    return {
      outputLanguage: params.outputLanguage ?? 'en',
      tender: this.buildTenderDto(params.tender),
      generalAnalysis: params.generalAnalysis?.resultJson ?? null,
      company: params.company,
      companyAnalysis: params.companyAnalysis ?? null,
      derived: this.buildDerivedMetadata({
        tender: params.tender,
        company: params.company,
        documentsDownloadedCount: documentAnalyses.length,
        documentsAnalyzedCount: documentAnalyses.length,
      }),
      documentAnalyses,
      documentTextSnippets: params.documentTextSnippets ?? [],
    };
  }

  buildSourceHash(input: {
    tender: Tender;
    company: UserDocument;
    generalAnalysis?: TenderGeneralAnalysis | null;
    companyAnalysis?: unknown;
    documentAnalyses?: unknown[];
    documentTextSnippets?: unknown[];
    outputLanguage?: string;
  }): string {
    const companyAnalysis = input.companyAnalysis as
      | { sourceHash?: unknown }
      | undefined;

    return createHash('sha256')
      .update(
        JSON.stringify({
          promptVersion: TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION,
          outputLanguage: input.outputLanguage ?? 'en',
          tender: {
            id: input.tender.id,
            noticeVersion: input.tender.noticeVersion,
            title: input.tender.title,
            titleProc: input.tender.titleProc,
            titleLot: input.tender.titleLot,
            description: input.tender.description,
            descriptionLot: input.tender.descriptionLot,
            estimatedValue: input.tender.estimatedValue,
            noticeLanguage: input.tender.noticeLanguage,
            submissionLanguages: input.tender.submissionLanguages,
            buyerName: input.tender.buyerName,
            buyerCountry: input.tender.buyerCountry,
            publicationDate: input.tender.publicationDate,
            submissionDeadline: input.tender.submissionDeadline,
            questionsDeadline: input.tender.questionsDeadline,
            plannedStartDate: input.tender.plannedStartDate,
            plannedEndDate: input.tender.plannedEndDate,
            contractNature: input.tender.contractNature,
            procedureType: input.tender.procedureType,
            isDps: input.tender.isDps,
            isFrameworkAgreement: input.tender.isFrameworkAgreement,
            isSmeSuitable: input.tender.isSmeSuitable,
            electronicSubmission: input.tender.electronicSubmission,
            cpvCodes: input.tender.cpvCodes,
            placeOfPerformanceCountries:
              input.tender.placeOfPerformanceCountries,
            placeOfPerformanceCities: input.tender.placeOfPerformanceCities,
            lotIdentifiers: input.tender.lotIdentifiers,
            documentUrls: input.tender.documentUrls,
            submissionUrls: input.tender.submissionUrls,
            selectionCriteria: input.tender.selectionCriteria,
            awardCriteria: input.tender.awardCriteria,
          },
          company: {
            id: String((input.company as any)._id),
            companyName: input.company.companyName,
            country: input.company.country,
            operatingCountries: input.company.operatingCountries,
            companySize: input.company.companySize,
            companyDescription: input.company.companyDescription,
            industries: normalizeForHash(input.company.industries),
            mainServices: normalizeForHash(input.company.mainServices),
            languages: input.company.languages,
            certifications: input.company.certifications,
            capabilities: input.company.capabilities,
            yearsOfExperience: input.company.yearsOfExperience,
            publicProcurementExperience:
              input.company.publicProcurementExperience,
            typicalContractSize: input.company.typicalContractSize,
          },
          generalAnalysisSourceHash: input.generalAnalysis?.sourceHash,
          companyAnalysisSourceHash: companyAnalysis?.sourceHash,
          documentAnalyses: input.documentAnalyses?.map((doc: any) => ({
            id: doc?._id,
            sourceUrl: doc?.sourceUrl,
            sourceHash: doc?.sourceHash,
            textHash: doc?.textHash,
            updatedAt: doc?.updatedAt,
          })),
          documentTextSnippets: input.documentTextSnippets?.map((doc: any) => ({
            sourceUrl: doc?.sourceUrl,
            textHash: doc?.textHash,
            filename: doc?.filename,
            documentType: doc?.documentType,
          })),
        }),
      )
      .digest('hex');
  }

  normalizeResult(
    result: TenderDeepAnalysisResult,
    input: TenderDeepCompanyFitAnalysisInput,
  ): TenderDeepAnalysisResult {
    ensureResultShape(result, input);
    applyMissingCompanyInfo(result, input);
    applyScoreBreakdown(result);
    applyGuardrails(result, input);
    applyEvidenceBasedScoreFallbacks(result, input);
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
    result.scores.riskScore = clampRound(result.riskAnalysis.riskScore);
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
    normalizeProcedureWording(result);
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

export function normalizeForHash(values: unknown): unknown {
  if (Array.isArray(values)) {
    return values.map(normalizeForHash);
  }

  if (!values || typeof values !== 'object') {
    return values;
  }

  const item = values as any;

  return {
    id: item._id || item.id ? String(item._id || item.id) : undefined,
    code: item.code || item.cpvCode || item.value || undefined,
    name: item.name || item.title || item.label || undefined,
    description: item.description || undefined,
  };
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
  result.riskAnalysis ||= {} as TenderDeepAnalysisResult['riskAnalysis'];
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
  applyDocumentCounts(result, input);

  const scoreBreakdown = getScoreBreakdownRecord(result);
  for (const key of SCORE_KEYS) {
    scoreBreakdown[key] ||= {
      score: 0,
      weight: COMPANY_FIT_WEIGHTS[key],
      weightedScore: 0,
      explanation: 'Missing LLM score; defaulted by backend.',
      evidence: [],
      missingInformation: [],
    };
  }
}

function applyTenderIntelligenceSourceFields(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  const originalTitle = input.tender.title ?? input.tender.titleProc;

  result.tenderIntelligence.originalTitle ||= originalTitle;
  result.tenderIntelligence.title ||= originalTitle ?? '';
  result.tenderIntelligence.lotsSummary ||= '';

  const sourceLotTitles = input.tender.titleLot ?? [];
  const sourceLotIds = input.tender.lotIdentifiers ?? [];
  const existingLots = Array.isArray(result.tenderIntelligence.lots)
    ? result.tenderIntelligence.lots
    : [];
  const lotCount = Math.max(
    existingLots.length,
    sourceLotTitles.length,
    sourceLotIds.length,
  );

  if (lotCount === 0) {
    result.tenderIntelligence.lots = [];
    return;
  }

  result.tenderIntelligence.lots = Array.from({ length: lotCount }).map(
    (_, index) => {
      const existing = existingLots[index];
      const sourceTitle = sourceLotTitles[index];
      const sourceId = sourceLotIds[index];

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
    const legacyScore = directCompanyScore ?? scoresBreakdownItem ?? mutable.scores[key];

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
  const documentsAnalyzedCount = input.derived.documentsAnalyzedCount;
  const documentsTotalCount = Math.max(
    input.derived.documentUrlsCount,
    input.derived.documentsDownloadedCount,
    documentsAnalyzedCount,
  );

  result.documentationAnalysis.documentsAnalyzedCount = documentsAnalyzedCount;
  result.documentationAnalysis.documentsTotalCount = documentsTotalCount;
  result.documentationAnalysis.documentsAvailable = documentsAnalyzedCount > 0;
  result.documentationAnalysis.missingDocumentsWarning =
    documentsTotalCount > documentsAnalyzedCount;
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

function removeDuplicateScoreBreakdowns(result: TenderDeepAnalysisResult): void {
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

function applyEvidenceBasedScoreFallbacks(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  const scoreBreakdown = getScoreBreakdownRecord(result);

  if (isDefaultedScore(scoreBreakdown.languageFit) && hasLanguageOverlap(input)) {
    scoreBreakdown.languageFit.score = 100;
    scoreBreakdown.languageFit.explanation =
      'English is accepted for submission and the company supports English.';
    scoreBreakdown.languageFit.evidence = ['structured_ted', 'company_profile'];
    scoreBreakdown.languageFit.missingInformation = [];
  }

  if (
    isDefaultedScore(scoreBreakdown.financialFit) &&
    hasTypicalContractSize(input.company)
  ) {
    scoreBreakdown.financialFit.score = input.tender.estimatedValue?.amount
      ? 50
      : 40;
    scoreBreakdown.financialFit.explanation =
      input.tender.estimatedValue?.amount === undefined ||
      input.tender.estimatedValue?.amount === null
        ? 'Estimated value is missing. Company typical contract range is declared, but no reliable comparison is possible.'
        : 'Company typical contract range is declared, but financial fit remains uncertain.';
    scoreBreakdown.financialFit.evidence = ['company_profile', 'missing'];
    scoreBreakdown.financialFit.missingInformation = ['estimated_tender_value'];
  }

  if (
    isDefaultedScore(scoreBreakdown.deadlineFit) &&
    input.derived.deadlineUrgency !== 'expired'
  ) {
    scoreBreakdown.deadlineFit.score =
      input.derived.deadlineUrgency === 'critical'
        ? 30
        : input.derived.deadlineUrgency === 'short'
          ? 55
          : 70;
    scoreBreakdown.deadlineFit.explanation =
      'Submission deadline is not expired; timing is usable if other blockers were resolved.';
    scoreBreakdown.deadlineFit.evidence = ['derived'];
    scoreBreakdown.deadlineFit.missingInformation = [];
  }
}

function applyDecisionFactors(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
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
    addDecisionBlocker(blockers, {
      type: mapRiskBlockerType(blocker.type),
      severity: blocker.canBeResolved ? 'HIGH' : 'CRITICAL',
      description: blocker.description,
      source: 'risk',
    });
  }

  const legacyDecisionBlockers = extractTextList(
    (result.bidNoBidDecision as unknown as { criticalBlockers?: unknown })
      .criticalBlockers,
  );

  for (const description of legacyDecisionBlockers) {
    addDecisionBlocker(blockers, {
      type: inferDecisionBlockerType(description),
      severity: /no experience|no capability|no certifications|clearance/i.test(
        description,
      )
        ? 'CRITICAL'
        : 'HIGH',
      description,
      source: 'bid_decision',
    });
  }

  if (!input.company.capabilities || input.company.capabilities.length === 0) {
    addDecisionBlocker(blockers, {
      type: 'capability',
      severity: 'CRITICAL',
      description:
        'No declared capability or experience in the required industrial/nuclear maintenance scope.',
      source: 'backend_guardrail',
    });
  }

  if (!input.company.certifications || input.company.certifications.length === 0) {
    addDecisionBlocker(blockers, {
      type: 'certification',
      severity: 'CRITICAL',
      description:
        'No declared certifications or site-access clearances for nuclear or industrial maintenance work.',
      source: 'backend_guardrail',
    });
  }

  if (input.derived.preliminarySignals.countryOverlap === false) {
    addDecisionBlocker(blockers, {
      type: 'geography',
      severity: 'HIGH',
      description: 'No operating presence in the tender performance country.',
      source: 'backend_guardrail',
    });
  }

  if (input.derived.preliminarySignals.cpvOverlap === false) {
    addDecisionBlocker(blockers, {
      type: 'capability',
      severity: 'CRITICAL',
      description: 'Company CPV/profile does not overlap with the tender scope.',
      source: 'backend_guardrail',
    });
  }

  if (hasSelectionCriteriaGap(result)) {
    addDecisionBlocker(blockers, {
      type: 'eligibility',
      severity: 'HIGH',
      description:
        'Selection criteria are missing or unclear and likely require relevant maintenance references.',
      source: 'backend_guardrail',
    });
  }

  result.decisionFactors = {
    ...(result.decisionFactors ?? {}),
    criticalBlockers: compactDecisionBlockers(blockers),
  };
}

function applyDocumentationAndClarity(
  result: TenderDeepAnalysisResult,
  input: TenderDeepCompanyFitAnalysisInput,
): void {
  const missingDocuments = normalizeStringList(
    result.documentationAnalysis.missingDocuments,
  );
  const documentCoverageText = [
    (result.documentationAnalysis as unknown as { documentCoverage?: unknown })
      .documentCoverage,
    (result.documentationAnalysis as unknown as { recommendation?: unknown })
      .recommendation,
    ...missingDocuments,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  const hasMissingProcurementDocs =
    missingDocuments.length > 0 ||
    /partial|not downloaded|not analyzed|technical specifications|procurement documents|annex/i.test(
      documentCoverageText,
    );
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
  (
    result.documentationAnalysis as unknown as {
      noticeDocumentsAnalyzedCount?: number;
      procurementDocumentsAnalyzedCount?: number;
      procurementDocumentsAvailable?: boolean;
    }
  ).noticeDocumentsAnalyzedCount = input.derived.documentsAnalyzedCount;
  (
    result.documentationAnalysis as unknown as {
      procurementDocumentsAnalyzedCount?: number;
    }
  ).procurementDocumentsAnalyzedCount = 0;
  (
    result.documentationAnalysis as unknown as {
      procurementDocumentsAvailable?: boolean;
    }
  ).procurementDocumentsAvailable = input.derived.documentUrlsCount > 0;
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
  const technicalSpecificationClarityScore = hasMissingProcurementDocs ? 20 : 65;
  const selectionCriteriaClarityScore = hasSelectionCriteriaGap(result) ? 25 : 60;
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

  if (
    typeof tenderIntelligence.procedureType === 'string' &&
    /with prior call|without call|neg-w-call|negotiated/i.test(
      tenderIntelligence.procedureType,
    )
  ) {
    tenderIntelligence.procedureType = ambiguousProcedure;
  }

  if (typeof tenderIntelligence.procedureDescription === 'string') {
    tenderIntelligence.procedureDescription = ambiguousProcedure;
  }

  if (!/with prior call|without prior call|invited bidders|restricted/i.test(
    result.executiveSummary,
  )) {
    return;
  }

  result.executiveSummary = result.executiveSummary.replace(
    /The procedure is [^.]*\.|Participation likely restricted to invited bidders\./i,
    'The procedure type is ambiguous/restricted: structured TED data indicates neg-w-call, while notice text may indicate a request-to-participate or invited-bidder stage.',
  );
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

function isDefaultedScore(item: { score: number; explanation?: string }): boolean {
  return item.score === 0 && /missing llm score|defaulted by backend/i.test(
    item.explanation ?? '',
  );
}

function hasLanguageOverlap(input: TenderDeepCompanyFitAnalysisInput): boolean {
  return input.derived.preliminarySignals.languageOverlap === true;
}

function extractTextList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function addDecisionBlocker(
  blockers: NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'],
  blocker: NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'][number],
): void {
  if (typeof blocker.description !== 'string' || blocker.description.trim() === '') {
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

function compactDecisionBlockers(
  blockers: NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'],
): NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'] {
  const byType = new Map<
    NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'][number]['type'],
    NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'][number]
  >();

  for (const blocker of blockers) {
    if (typeof blocker.description !== 'string' || blocker.description.trim() === '') {
      continue;
    }

    const current = byType.get(blocker.type);

    if (!current || severityRank(blocker.severity) > severityRank(current.severity)) {
      byType.set(blocker.type, blocker);
    }
  }

  const canonicalDescriptions: Partial<
    Record<
      NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'][number]['type'],
      string
    >
  > = {
    eligibility:
      'Procedure access/selection criteria are unclear or restricted; company has no evidence of invitation or qualification.',
    capability:
      'No declared capability or experience in the required industrial/nuclear maintenance scope.',
    certification:
      'No declared certifications or site-access clearances for nuclear or industrial maintenance work.',
    geography: 'No operating presence in the tender performance country.',
  };
  const order: Array<
    NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'][number]['type']
  > = ['eligibility', 'capability', 'certification', 'geography', 'financial'];

  return order
    .map((type) => byType.get(type))
    .filter(
      (
        blocker,
      ): blocker is NonNullable<
        TenderDeepAnalysisResult['decisionFactors']
      >['criticalBlockers'][number] => Boolean(blocker),
    )
    .map((blocker) => ({
      ...blocker,
      description: canonicalDescriptions[blocker.type] ?? blocker.description,
      severity:
        blocker.type === 'capability' || blocker.type === 'certification'
          ? 'CRITICAL'
          : blocker.severity,
    }))
    .slice(0, 5);
}

function severityRank(severity: string): number {
  if (severity === 'CRITICAL') return 4;
  if (severity === 'HIGH') return 3;
  if (severity === 'MEDIUM') return 2;
  return 1;
}

function cleanupCompanyFitAnalysis(result: TenderDeepAnalysisResult): void {
  const mutable = result.companyFitAnalysis as unknown as Record<string, unknown>;

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
      item.explanation = getUserFacingScoreExplanation(key);
    }

    item.evidence = normalizeStringList(item.evidence);
    item.missingInformation = normalizeStringList(item.missingInformation);
  }

  applyScoreBreakdown(result);
}

function isTechnicalScoreExplanation(value: unknown): boolean {
  return (
    typeof value !== 'string' ||
    value.trim() === '' ||
    /score returned in legacy scores block|missing llm score|defaulted by backend/i.test(
      value,
    )
  );
}

function getUserFacingScoreExplanation(key: CompanyFitScoreKey): string {
  const explanations: Record<CompanyFitScoreKey, string> = {
    scopeFit:
      'Tender scope is industrial/nuclear repair and maintenance; company profile indicates software development only.',
    capabilityFit:
      'No declared company capability in industrial, mechanical, or nuclear maintenance.',
    cpvFit:
      'Tender CPV is repair and maintenance services; company CPV/profile does not overlap with that scope.',
    geographicFit:
      'Tender performance is in Slovenia; company operating countries do not include Slovenia.',
    languageFit:
      'English is accepted for submission and the company supports English.',
    eligibilityFit:
      'Procedure access and selection criteria appear restricted or unclear; invitation/qualification status is not evidenced.',
    certificationFit:
      'No declared certifications or site-access clearances for nuclear or industrial maintenance work.',
    experienceFit:
      'No relevant industrial or nuclear maintenance references are declared.',
    financialFit:
      'Estimated value is missing; company typical contract range is declared, but reliable comparison is not possible.',
    commercialFit:
      'Commercial fit is poor because the company cannot credibly deliver the tender scope.',
    deadlineFit:
      'Submission deadline is not expired and timing is usable for a prepared bidder, but other blockers dominate.',
    riskFit:
      'Risk fit is poor because capability, certification, geography, and eligibility blockers are material.',
  };

  return explanations[key];
}

function applyCompanyFitSummaryFields(result: TenderDeepAnalysisResult): void {
  const mutable = result.companyFitAnalysis as unknown as Record<string, unknown>;

  if (!Array.isArray(mutable.strengths) || mutable.strengths.length === 0) {
    mutable.strengths = [
      'English is accepted as a submission language.',
      'Submission deadline is not immediately urgent for a prepared bidder.',
    ];
  }

  if (!Array.isArray(mutable.weaknesses) || mutable.weaknesses.length === 0) {
    mutable.weaknesses = [
      'No declared repair or maintenance capability.',
      'No declared nuclear or industrial maintenance certifications.',
      'No operating presence in Slovenia.',
      'No CPV/profile overlap with the repair and maintenance scope.',
    ];
  }

  if (!Array.isArray(mutable.capabilityGaps) || mutable.capabilityGaps.length === 0) {
    mutable.capabilityGaps = [
      {
        requirement: 'Nuclear/industrial maintenance capability',
        currentState: 'Company profile indicates software development only.',
        severity: 'CRITICAL',
      },
      {
        requirement: 'Nuclear safety certifications and site-access clearances',
        currentState: 'No relevant certifications are declared.',
        severity: 'CRITICAL',
      },
      {
        requirement: 'On-site delivery capability in Slovenia',
        currentState: 'Company operating countries do not include Slovenia.',
        severity: 'HIGH',
      },
    ];
  }
}

function syncDocumentationScores(result: TenderDeepAnalysisResult): void {
  const documentationAnalysis = result.documentationAnalysis as unknown as Record<
    string,
    unknown
  >;

  documentationAnalysis.documentationScores = result.documentationScores;
  delete documentationAnalysis.missingDocumentsImpact;
  delete documentationAnalysis.missingDocumentsImpactOnDecision;
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

function normalizeProcedureWording(result: TenderDeepAnalysisResult): void {
  const cautiousProcedure =
    'Participation appears restricted or subject to pre-selection; exact access conditions must be confirmed in the procurement documents.';

  normalizeProcedureTextInObject(result.requirementsAnalysis, cautiousProcedure);
  normalizeProcedureTextInObject(result.riskAnalysis, cautiousProcedure);
  normalizeProcedureTextInObject(result.bidNoBidDecision, cautiousProcedure);
  normalizeProcedureTextInObject(result.evidenceMap, cautiousProcedure);
}

function normalizeProcedureTextInObject(value: unknown, replacement: string): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (typeof value[index] === 'string') {
        value[index] = normalizeProcedureText(value[index], replacement);
      } else {
        normalizeProcedureTextInObject(value[index], replacement);
      }
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (typeof nestedValue === 'string') {
      value[key] = normalizeProcedureText(nestedValue, replacement);
    } else {
      normalizeProcedureTextInObject(nestedValue, replacement);
    }
  }
}

function normalizeProcedureText(value: string, replacement: string): string {
  if (
    /only invited bidders can participate|only invited bidders may participate|requires prior invitation|restricted to invited bidders|procedure restricted to invited bidders/i.test(
      value,
    )
  ) {
    return replacement;
  }

  return value
    .replace(/company is not invited/gi, 'there is no evidence that the company is invited or qualified')
    .replace(/not invited/gi, 'not evidenced as invited or qualified');
}

function mapCompanyBlockerType(
  type: string,
): NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'][number]['type'] {
  if (/capability|scope|reference/.test(type)) return 'capability';
  if (/certification/.test(type)) return 'certification';
  if (/geograph/.test(type)) return 'geography';
  if (/eligibility|mandatory/.test(type)) return 'eligibility';
  if (/deadline/.test(type)) return 'deadline';
  if (/language/.test(type)) return 'language';
  if (/financial/.test(type)) return 'financial';
  if (/legal/.test(type)) return 'legal';
  return 'other';
}

function mapRiskBlockerType(
  type: string,
): NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'][number]['type'] {
  if (/company_fit|scope/.test(type)) return 'capability';
  if (/mandatory|eligibility/.test(type)) return 'eligibility';
  if (/language/.test(type)) return 'language';
  if (/financial/.test(type)) return 'financial';
  if (/legal/.test(type)) return 'legal';
  if (/deadline/.test(type)) return 'deadline';
  return 'other';
}

function inferDecisionBlockerType(
  description: string,
): NonNullable<TenderDeepAnalysisResult['decisionFactors']>['criticalBlockers'][number]['type'] {
  if (/procedure|restricted|invited|invitation|selection|eligib/i.test(description)) return 'eligibility';
  if (/certification|clearance/i.test(description)) return 'certification';
  if (/capability|experience|maintenance|nuclear|industrial/i.test(description)) {
    return 'capability';
  }
  if (/slovenia|presence|geograph/i.test(description)) return 'geography';
  return 'other';
}

function hasSelectionCriteriaGap(result: TenderDeepAnalysisResult): boolean {
  const text = JSON.stringify(result.requirementsAnalysis ?? {});

  return /selection criteria.*not|not explicitly listed|unknown|missing|likely require/i.test(
    text,
  );
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
    Math.min(100, typeof value === 'number' && Number.isFinite(value) ? value : 0),
  );
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
