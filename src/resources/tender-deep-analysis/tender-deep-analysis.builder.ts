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
import { Tender, TenderDocument } from '../tenders/schemas';
import { UserDocument } from '../user/user.types';
import { TenderGeneralAnalysis } from '../tender-analysis/schemas';

export const COMPANY_FIT_WEIGHTS = {
  scopeFit: 0.18,
  capabilityFit: 0.16,
  cpvFit: 0.08,
  geographicFit: 0.08,
  languageFit: 0.07,
  eligibilityFit: 0.12,
  certificationFit: 0.07,
  experienceFit: 0.08,
  financialFit: 0.06,
  commercialFit: 0.04,
  deadlineFit: 0.04,
  riskFit: 0.02,
} as const satisfies Record<CompanyFitScoreKey, number>;

const SCORE_KEYS = Object.keys(COMPANY_FIT_WEIGHTS) as CompanyFitScoreKey[];

@Injectable()
export class TenderDeepAnalysisBuilder {
  buildCompanyAnalysisDto(user: UserDocument): CompanyAnalysisDto {
    const source = user as any;

    return {
      id: String(source._id),
      companyName: source.companyName || undefined,
      country: source.country || undefined,
      operatingRegions: Array.isArray(source.operatingRegions)
        ? source.operatingRegions
        : [],
      companySize: source.companySize || undefined,
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
  }): TenderDeepCompanyFitAnalysisInput {
    const documentAnalyses = params.documentAnalyses ?? [];

    return {
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
  }): string {
    const companyAnalysis = input.companyAnalysis as
      | { sourceHash?: unknown }
      | undefined;

    return createHash('sha256')
      .update(
        JSON.stringify({
          promptVersion: TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION,
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
            operatingRegions: input.company.operatingRegions,
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
            sourceHash: doc?.sourceHash,
            updatedAt: doc?.updatedAt,
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
    applyScoreBreakdown(result);

    result.scores.fitScore = result.companyFitAnalysis.fitScore;
    result.scores.fitConfidenceScore = clampRound(
      result.companyFitAnalysis.confidenceScore,
    );
    result.companyFitAnalysis.confidenceScore =
      result.scores.fitConfidenceScore;

    const recommendation = calculateFinalRecommendation(result, input);
    result.finalRecommendation.value = recommendation;
    result.companyFitAnalysis.recommendation = recommendation;
    result.bidNoBidDecision.decision =
      mapRecommendationToBidDecision(recommendation);

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
    result.scores.eligibilityFitScore = clampRound(
      result.companyFitAnalysis.scoreBreakdown.eligibilityFit.score,
    );
    result.scores.commercialFitScore = clampRound(
      result.companyFitAnalysis.scoreBreakdown.commercialFit.score,
    );
    result.scores.deadlineFitScore = clampRound(
      result.companyFitAnalysis.scoreBreakdown.deadlineFit.score,
    );

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
  result.tenderId = input.tender.id;
  result.companyId = input.company.id;
  result.companyFitAnalysis ||= {} as TenderDeepAnalysisResult['companyFitAnalysis'];
  result.companyFitAnalysis.scoreBreakdown ||= {} as CompanyFitScoreBreakdown;
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
  result.documentationAnalysis ||= {} as TenderDeepAnalysisResult['documentationAnalysis'];
  result.scores ||= {} as TenderDeepAnalysisResult['scores'];

  for (const key of SCORE_KEYS) {
    result.companyFitAnalysis.scoreBreakdown[key] ||= {
      score: 0,
      weight: COMPANY_FIT_WEIGHTS[key],
      weightedScore: 0,
      explanation: 'Missing LLM score; defaulted by backend.',
      evidence: [],
      missingInformation: [],
    };
  }
}

function applyScoreBreakdown(result: TenderDeepAnalysisResult): void {
  let fitScore = 0;

  for (const key of SCORE_KEYS) {
    const item = result.companyFitAnalysis.scoreBreakdown[key];
    item.score = clampRound(item.score);
    item.weight = COMPANY_FIT_WEIGHTS[key];
    item.weightedScore = roundScore(item.score * item.weight);
    item.evidence = Array.isArray(item.evidence) ? item.evidence : [];
    item.missingInformation = Array.isArray(item.missingInformation)
      ? item.missingInformation
      : [];
    fitScore += item.weightedScore;
  }

  result.companyFitAnalysis.fitScore = clampRound(fitScore);
  result.scores.fitScore = result.companyFitAnalysis.fitScore;
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
    missing.push('Company industries and main services are missing or not populated.');
  }

  if (!input.company.capabilities || input.company.capabilities.length === 0) {
    missing.push('Company capabilities are missing.');
  }

  if (input.company.operatingRegions.length === 0) {
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
    input.company.operatingRegions.length === 0 &&
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
    containsRequiredCertification(result.requirementsAnalysis?.mandatoryRequirements) &&
    (!input.company.certifications || input.company.certifications.length === 0)
  ) {
    capCriterion(result, 'certificationFit', 50);
    result.companyFitAnalysis.gaps.push({
      category: 'certification',
      severity: 'high',
      description:
        'Required tender certifications are present, but company certifications are missing or not provided.',
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
    result.companyFitAnalysis.scoreBreakdown.deadlineFit.score = 0;
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
  const criterion = result.companyFitAnalysis.scoreBreakdown[key];
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
    ...company.operatingRegions,
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

function getValueBand(amount?: number | null): TenderCompanyFitDerivedMetadata['valueBand'] {
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
    Math.min(100, Math.round(typeof value === 'number' ? value : 0)),
  );
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
