import { CompanyFitScoreKey, TenderDeepAnalysisResult } from '@/types';
import { normalizeMissingDocuments } from './missing-tender-documents.utils';
import { TENDER_DEEP_ANALYSIS_CONFIG } from '@/config/tender-deep-analysis.config';

const SCORE_KEYS = Object.keys(
  TENDER_DEEP_ANALYSIS_CONFIG.scoring.companyFitWeights,
) as CompanyFitScoreKey[];

export function normalizeResultJsonScoreBreakdown(
  resultJson: TenderDeepAnalysisResult,
): TenderDeepAnalysisResult {
  const normalized = structuredClone(resultJson) as TenderDeepAnalysisResult;
  normalizeSerializedRiskAnalysisShape(normalized);
  const mutable = normalized as unknown as {
    companyFitAnalysis: Record<string, unknown>;
    scores: Record<string, unknown>;
  };
  mutable.companyFitAnalysis ||= {};
  mutable.scores ||= {};

  if (!Array.isArray(mutable.scores.scoreBreakdown)) {
    const legacyCompanyBreakdown = isRecordLike(
      mutable.companyFitAnalysis.scoreBreakdown,
    )
      ? mutable.companyFitAnalysis.scoreBreakdown
      : {};

    mutable.scores.scoreBreakdown = SCORE_KEYS.flatMap((criterion) => {
      const score =
        mutable.companyFitAnalysis[criterion] ??
        legacyCompanyBreakdown[criterion] ??
        mutable.scores[criterion];

      return isRecordLike(score)
        ? [
            {
              criterion,
              ...score,
            },
          ]
        : [];
    });
  }

  const scoreItems = Array.isArray(mutable.scores.scoreBreakdown)
    ? mutable.scores.scoreBreakdown
    : [];
  applySerializedScoreExplanations(scoreItems, normalized.language);
  const weightedSum = roundScore(
    scoreItems.reduce((sum, item) => {
      return (
        sum +
        (isRecordLike(item) && typeof item.weightedScore === 'number'
          ? item.weightedScore
          : 0)
      );
    }, 0),
  );
  const totalWeight = scoreItems.reduce((sum, item) => {
    return (
      sum +
      (isRecordLike(item) && typeof item.weight === 'number' ? item.weight : 0)
    );
  }, 0);

  mutable.scores.totalWeight = mutable.scores.totalWeight ?? totalWeight;
  mutable.scores.weightedSum = mutable.scores.weightedSum ?? weightedSum;
  mutable.scores.fitScore = mutable.scores.fitScore ?? weightedSum;
  const riskFit = findScoreItem(scoreItems, 'riskFit');
  if (riskFit && typeof riskFit.score === 'number') {
    mutable.scores.riskFitScore = clampSerializedScore(riskFit.score);
  }
  normalizeSerializedDocumentationAndClarity(normalized);
  normalizeSerializedProcedure(normalized);
  cleanupSerializedCompanyFitAnalysis(normalized);
  mutable.scores.riskLevelScore = calculateSerializedRiskLevelScore(normalized);
  mutable.scores.riskScore = mutable.scores.riskLevelScore;
  syncSerializedLegacyFitScores(normalized);
  normalizeSerializedSeverityLabels(normalized);
  removeSerializedEmptyScoreEvidence(normalized);
  normalizeSerializedEvidenceMap(normalized);

  delete mutable.companyFitAnalysis.scoreBreakdown;

  for (const key of SCORE_KEYS) {
    delete mutable.companyFitAnalysis[key];
    delete mutable.scores[key];
  }

  return normalized;
}

function applySerializedScoreExplanations(
  scoreItems: unknown[],
  _language?: string,
): void {
  for (const key of SCORE_KEYS) {
    const item = findScoreItem(scoreItems, key);

    if (!item) {
      continue;
    }

    if (isTechnicalSerializedScoreExplanation(item.explanation)) {
      item.explanation = buildSerializedScoreExplanationFallback(key, item);
    }

    if (!Array.isArray(item.evidence)) {
      item.evidence = [];
    }

    if (!Array.isArray(item.missingInformation)) {
      item.missingInformation = [];
    }
  }
}

function isTechnicalSerializedScoreExplanation(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

function buildSerializedScoreExplanationFallback(
  key: CompanyFitScoreKey,
  item: Record<string, unknown>,
): string {
  const evidence = normalizeStringList(item.evidence);
  const missingInformation = normalizeStringList(item.missingInformation);

  if (evidence.length > 0) {
    return evidence.join('; ');
  }

  if (missingInformation.length > 0) {
    return missingInformation.join('; ');
  }

  return `${key}: ${clampSerializedScore(item.score)}/100`;
}

function normalizeSerializedRiskAnalysisShape(
  resultJson: TenderDeepAnalysisResult,
): void {
  const riskAnalysis = resultJson.riskAnalysis as unknown;

  if (!Array.isArray(riskAnalysis)) {
    return;
  }

  resultJson.riskAnalysis = {
    overallRiskLevel: 'critical',
    riskScore: 0,
    tenderRisks: [],
    companySpecificRisks: [],
    criticalBlockers: [],
    mitigations: [],
    risks: riskAnalysis,
  } as unknown as TenderDeepAnalysisResult['riskAnalysis'];
}

function normalizeSerializedDocumentationAndClarity(
  resultJson: TenderDeepAnalysisResult,
): void {
  const mutable = resultJson as unknown as {
    documentationAnalysis?: Record<string, unknown>;
    documentationScores?: Record<string, unknown>;
    requirementsClarity?: Record<string, unknown>;
    scores?: Record<string, unknown>;
    decisionFactors?: Record<string, unknown>;
  };
  mutable.documentationAnalysis ||= {};
  mutable.scores ||= {};
  mutable.decisionFactors ||= {};

  const missingDocuments = Array.isArray(
    mutable.documentationAnalysis.missingDocuments,
  )
    ? mutable.documentationAnalysis.missingDocuments
    : [];
  mutable.documentationAnalysis.missingDocuments = normalizeMissingDocuments(
    missingDocuments,
    {
      portalUrls: [],
      directFileUrls: [],
      analyzedDocumentNames: [],
    },
  );
  const normalizedMissingDocuments = mutable.documentationAnalysis
    .missingDocuments as ReturnType<typeof normalizeMissingDocuments>;
  const hasMissingDocs =
    normalizedMissingDocuments.length > 0 ||
    (getNumber(
      mutable.documentationAnalysis.procurementDocumentsAnalyzedCount,
    ) === 0 &&
      mutable.documentationAnalysis.procurementDocumentsAvailable === true);
  const hasClearNoGo =
    resultJson.finalRecommendation?.value === 'no_go' &&
    ((mutable.decisionFactors.criticalBlockers as unknown[])?.length ?? 0) > 0;
  const noticeCoverageScore = 80;
  const procurementPackageCoverageScore = hasMissingDocs ? 0 : 70;
  const technicalSpecCoverageScore = hasMissingDocs ? 0 : 60;
  const bidPreparationSufficiencyScore = hasMissingDocs ? 10 : 80;
  const goNoGoDecisionSufficiencyScore = hasClearNoGo
    ? 90
    : hasMissingDocs
      ? 60
      : 80;
  const overallDocumentationCompletenessScore = Math.round(
    noticeCoverageScore * 0.35 +
      procurementPackageCoverageScore * 0.3 +
      technicalSpecCoverageScore * 0.25 +
      goNoGoDecisionSufficiencyScore * 0.1,
  );

  mutable.documentationScores = {
    noticeCoverageScore,
    procurementPackageCoverageScore,
    technicalSpecCoverageScore,
    bidPreparationSufficiencyScore,
    goNoGoDecisionSufficiencyScore,
    overallDocumentationCompletenessScore,
  };
  mutable.documentationAnalysis.documentationScores =
    mutable.documentationScores;
  delete mutable.documentationAnalysis.missingDocumentsImpact;
  delete mutable.documentationAnalysis.missingDocumentsImpactOnDecision;
  mutable.documentationAnalysis.missingDocumentsWarning = hasMissingDocs;
  mutable.documentationAnalysis.documentationCompletenessScore =
    overallDocumentationCompletenessScore;
  const noticeDocumentsAnalyzedCount =
    typeof mutable.documentationAnalysis.noticeDocumentsAnalyzedCount ===
    'number'
      ? mutable.documentationAnalysis.noticeDocumentsAnalyzedCount
      : typeof mutable.documentationAnalysis.documentsAnalyzedCount === 'number'
        ? mutable.documentationAnalysis.documentsAnalyzedCount
        : 0;
  const procurementDocumentsAnalyzedCount =
    typeof mutable.documentationAnalysis.procurementDocumentsAnalyzedCount ===
    'number'
      ? mutable.documentationAnalysis.procurementDocumentsAnalyzedCount
      : 0;

  mutable.documentationAnalysis.noticeDocumentsAnalyzedCount =
    noticeDocumentsAnalyzedCount;
  mutable.documentationAnalysis.procurementDocumentsAnalyzedCount =
    procurementDocumentsAnalyzedCount;
  mutable.documentationAnalysis.procurementDocumentsAvailable = hasMissingDocs;
  mutable.documentationAnalysis.procurementDocumentsAccess =
    getSerializedProcurementDocumentsAccess(normalizedMissingDocuments);
  const documentsAnalyzedCount =
    noticeDocumentsAnalyzedCount + procurementDocumentsAnalyzedCount;

  mutable.documentationAnalysis.documentsAnalyzedCount = documentsAnalyzedCount;
  const existingDocumentsTotalCount =
    typeof mutable.documentationAnalysis.documentsTotalCount === 'number'
      ? mutable.documentationAnalysis.documentsTotalCount
      : 0;

  mutable.documentationAnalysis.documentsTotalCount = Math.max(
    existingDocumentsTotalCount,
    documentsAnalyzedCount,
    normalizedMissingDocuments.length,
  );
  mutable.scores.documentationCompletenessScore =
    overallDocumentationCompletenessScore;
  mutable.decisionFactors.missingDocumentsImpact = {
    impactOnBidPreparation: hasMissingDocs ? 'HIGH' : 'LOW',
    impactOnGoNoGoDecision: hasClearNoGo
      ? 'LOW'
      : hasMissingDocs
        ? 'HIGH'
        : 'LOW',
  };

  const noticeLevelClarityScore = 75;
  const technicalSpecificationClarityScore = hasMissingDocs ? 20 : 65;
  const selectionCriteriaClarityScore =
    hasMissingDocs || hasMissingSelectionCriteria(resultJson) ? 25 : 60;
  const goNoGoDecisionClarityScore = hasClearNoGo ? 90 : 65;

  mutable.requirementsClarity = {
    noticeLevelClarityScore,
    technicalSpecificationClarityScore,
    selectionCriteriaClarityScore,
    goNoGoDecisionClarityScore,
  };
  mutable.scores.requirementsClarityScore = Math.round(
    noticeLevelClarityScore * 0.35 +
      technicalSpecificationClarityScore * 0.25 +
      selectionCriteriaClarityScore * 0.2 +
      goNoGoDecisionClarityScore * 0.2,
  );

  const requirementsAnalysis = resultJson.requirementsAnalysis as unknown as
    | Record<string, unknown>
    | undefined;
  if (requirementsAnalysis) {
    requirementsAnalysis.technicalRequirementsClarityScore =
      technicalSpecificationClarityScore;
    delete requirementsAnalysis.requirementsClarityScore;
  }
}

function getSerializedProcurementDocumentsAccess(
  missingDocuments: Array<{ status?: string }>,
): 'MISSING' | 'PORTAL_LINK_AVAILABLE' | 'DIRECT_LINK_AVAILABLE' | 'UNKNOWN' {
  const statuses = new Set(missingDocuments.map((document) => document.status));

  if (statuses.has('DIRECT_LINK_AVAILABLE')) {
    return 'DIRECT_LINK_AVAILABLE';
  }
  if (statuses.has('PORTAL_LINK_AVAILABLE')) {
    return 'PORTAL_LINK_AVAILABLE';
  }
  if (missingDocuments.length > 0 || statuses.has('MISSING')) {
    return 'MISSING';
  }

  return 'UNKNOWN';
}

function findScoreItem(
  scoreItems: unknown[],
  criterion: CompanyFitScoreKey,
): Record<string, unknown> | undefined {
  return scoreItems.find(
    (item): item is Record<string, unknown> =>
      isRecordLike(item) && item.criterion === criterion,
  );
}

function normalizeSerializedProcedure(
  resultJson: TenderDeepAnalysisResult,
): void {
  const mutable = resultJson as unknown as {
    tenderIntelligence?: Record<string, unknown>;
    executiveSummary?: string;
  };
  const tenderIntelligence = mutable.tenderIntelligence;

  if (!tenderIntelligence) {
    return;
  }

  if (!hasStringValue(tenderIntelligence, 'neg-w-call')) {
    return;
  }

  const ambiguousProcedure =
    'Ambiguous/restricted negotiated procedure (structured TED: neg-w-call; notice text may indicate request-to-participate or invited-bidder stage).';

  tenderIntelligence.procedureType = ambiguousProcedure;

  if (typeof tenderIntelligence.procedureDescription === 'string') {
    tenderIntelligence.procedureDescription = ambiguousProcedure;
  }

  tenderIntelligence.procedureAccess = 'restricted_or_subject_to_preselection';
}

function cleanupSerializedCompanyFitAnalysis(
  resultJson: TenderDeepAnalysisResult,
): void {
  const mutable = resultJson as unknown as {
    companyFitAnalysis?: Record<string, unknown>;
  };

  if (!mutable.companyFitAnalysis) {
    return;
  }

  if (
    !Array.isArray(mutable.companyFitAnalysis.strengths) ||
    mutable.companyFitAnalysis.strengths.length === 0
  ) {
    mutable.companyFitAnalysis.strengths = [];
  }

  if (
    !Array.isArray(mutable.companyFitAnalysis.weaknesses) ||
    mutable.companyFitAnalysis.weaknesses.length === 0
  ) {
    mutable.companyFitAnalysis.weaknesses = [];
  }

  if (
    !Array.isArray(mutable.companyFitAnalysis.capabilityGaps) ||
    mutable.companyFitAnalysis.capabilityGaps.length === 0
  ) {
    mutable.companyFitAnalysis.capabilityGaps = [];
  }

  mutable.companyFitAnalysis.missingCompanyInformation =
    normalizeSerializedMissingCompanyInformation(
      mutable.companyFitAnalysis.missingCompanyInformation,
    );

  for (const key of [
    'strengths',
    'weaknesses',
    'gaps',
    'criticalBlockers',
    'missingTenderInformation',
  ]) {
    if (
      Array.isArray(mutable.companyFitAnalysis[key]) &&
      mutable.companyFitAnalysis[key].length === 0
    ) {
      delete mutable.companyFitAnalysis[key];
    }
  }
}

function syncSerializedLegacyFitScores(
  resultJson: TenderDeepAnalysisResult,
): void {
  const fitScore = resultJson.scores.fitScore;

  resultJson.companyFitAnalysis.fitScore = fitScore;
  (resultJson.bidNoBidDecision as unknown as { fitScore?: number }).fitScore =
    fitScore;
  (
    resultJson.finalRecommendation as unknown as { fitScore?: number }
  ).fitScore = fitScore;
}

function calculateSerializedRiskLevelScore(
  resultJson: TenderDeepAnalysisResult,
): number {
  const existingRiskScore = clampSerializedScore(
    resultJson.riskAnalysis.riskScore,
  );

  if (existingRiskScore > 0) {
    return existingRiskScore;
  }

  const blockers = resultJson.decisionFactors?.criticalBlockers ?? [];

  if (blockers.some((blocker) => blocker.severity === 'CRITICAL')) {
    return 95;
  }

  if (blockers.some((blocker) => blocker.severity === 'HIGH')) {
    return 85;
  }

  if (resultJson.finalRecommendation?.value === 'no_go') {
    return 80;
  }

  return 50;
}

function normalizeSerializedMissingCompanyInformation(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeSerializedSeverityLabels(
  resultJson: TenderDeepAnalysisResult,
): void {
  normalizeSeverityLabelsInObject(resultJson.riskAnalysis, resultJson.language);
  normalizeSeverityLabelsInObject(
    resultJson.companyFitAnalysis,
    resultJson.language,
  );
  normalizeSeverityLabelsInObject(
    resultJson.decisionFactors,
    resultJson.language,
  );
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

  if (!isRecordLike(value)) {
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

function removeSerializedEmptyScoreEvidence(
  resultJson: TenderDeepAnalysisResult,
): void {
  for (const item of resultJson.scores.scoreBreakdown ?? []) {
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

function normalizeSerializedEvidenceMap(
  resultJson: TenderDeepAnalysisResult,
): void {
  const rawItems = Array.isArray(resultJson.evidenceMap)
    ? resultJson.evidenceMap
    : [];

  resultJson.evidenceMap = rawItems
    .map((item): TenderDeepAnalysisResult['evidenceMap'][number] | null => {
      if (!isRecordLike(item)) {
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
        evidenceSource: normalizeSerializedEvidenceSource(
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
        confidence: normalizeSerializedEvidenceConfidence(item.confidence),
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

function normalizeSerializedEvidenceSource(
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

function normalizeSerializedEvidenceConfidence(
  value: unknown,
): TenderDeepAnalysisResult['evidenceMap'][number]['confidence'] {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (['high', 'medium', 'low'].includes(normalized)) {
    return normalized as TenderDeepAnalysisResult['evidenceMap'][number]['confidence'];
  }

  return 'medium';
}

function severityRank(severity: string): number {
  if (severity === 'CRITICAL') return 4;
  if (severity === 'HIGH') return 3;
  if (severity === 'MEDIUM') return 2;
  return 1;
}

function hasStringValue(value: unknown, expected: string): boolean {
  if (typeof value === 'string') {
    return value === expected;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasStringValue(item, expected));
  }

  if (!isRecordLike(value)) {
    return false;
  }

  return Object.values(value).some((item) => hasStringValue(item, expected));
}

function hasMissingSelectionCriteria(
  resultJson: TenderDeepAnalysisResult,
): boolean {
  const requirementsAnalysis = resultJson.requirementsAnalysis as unknown as
    | Record<string, unknown>
    | undefined;

  if (!requirementsAnalysis) {
    return true;
  }

  const selectionCriteria = requirementsAnalysis.selectionCriteria;
  const eligibilityCriteria = requirementsAnalysis.eligibilityCriteria;

  if (Array.isArray(selectionCriteria)) {
    return selectionCriteria.length === 0;
  }

  if (Array.isArray(eligibilityCriteria)) {
    return eligibilityCriteria.length === 0;
  }

  return selectionCriteria === undefined && eligibilityCriteria === undefined;
}

function getNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampSerializedScore(value: unknown): number {
  return Math.max(
    0,
    Math.min(
      100,
      typeof value === 'number' && Number.isFinite(value) ? value : 0,
    ),
  );
}
