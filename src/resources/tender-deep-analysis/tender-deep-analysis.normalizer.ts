import { CompanyFitScoreKey, TenderDeepAnalysisResult } from '@/types';
import { normalizeMissingDocuments } from './missing-tender-documents.utils';

const SCORE_KEYS: CompanyFitScoreKey[] = [
  'scopeFit',
  'capabilityFit',
  'cpvFit',
  'geographicFit',
  'languageFit',
  'eligibilityFit',
  'certificationFit',
  'experienceFit',
  'financialFit',
  'commercialFit',
  'deadlineFit',
  'riskFit',
];

export function normalizeResultJsonScoreBreakdown(
  resultJson: TenderDeepAnalysisResult,
): TenderDeepAnalysisResult {
  const normalized = structuredClone(resultJson) as TenderDeepAnalysisResult;
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

    mutable.scores.scoreBreakdown = SCORE_KEYS.map((criterion) => {
      const score =
        mutable.companyFitAnalysis[criterion] ??
        legacyCompanyBreakdown[criterion] ??
        mutable.scores[criterion];

      return {
        criterion,
        ...(isRecordLike(score)
          ? score
          : {
              score: 0,
              weight: getScoreWeight(criterion),
              weightedScore: 0,
              explanation: '',
              evidence: ['backend_fallback'],
              missingInformation: [],
            }),
      };
    });
  }

  const scoreItems = Array.isArray(mutable.scores.scoreBreakdown)
    ? mutable.scores.scoreBreakdown
    : [];
  applySerializedScoreFallbacks(normalized, scoreItems);
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
  normalizeSerializedDecisionFactors(normalized);
  normalizeSerializedDocumentationAndClarity(normalized);
  normalizeSerializedProcedure(normalized);
  cleanupSerializedCompanyFitAnalysis(normalized);
  mutable.scores.riskLevelScore = calculateSerializedRiskLevelScore(normalized);
  mutable.scores.riskScore = mutable.scores.riskLevelScore;
  syncSerializedLegacyFitScores(normalized);
  normalizeSerializedSeverityLabels(normalized);
  removeSerializedEmptyScoreEvidence(normalized);

  delete mutable.companyFitAnalysis.scoreBreakdown;

  for (const key of SCORE_KEYS) {
    delete mutable.companyFitAnalysis[key];
    delete mutable.scores[key];
  }

  return normalized;
}

function applySerializedScoreFallbacks(
  resultJson: TenderDeepAnalysisResult,
  scoreItems: unknown[],
): void {
  const languageFit = findScoreItem(scoreItems, 'languageFit');
  const financialFit = findScoreItem(scoreItems, 'financialFit');
  const deadlineFit = findScoreItem(scoreItems, 'deadlineFit');

  if (
    languageFit &&
    isDefaultedSerializedScore(languageFit) &&
    hasStringValue(resultJson, 'ENG')
  ) {
    languageFit.score = 100;
    languageFit.weightedScore = 7;
    languageFit.explanation =
      'English is accepted for submission and the company supports English.';
    languageFit.evidence = ['structured_ted', 'company_profile'];
  }

  if (
    financialFit &&
    isDefaultedSerializedScore(financialFit) &&
    hasMissingEstimatedValue(resultJson)
  ) {
    financialFit.score = 40;
    financialFit.weightedScore = 2.4;
    financialFit.explanation =
      'Estimated value is missing. Company typical contract range is declared, but no reliable comparison is possible.';
    financialFit.evidence = ['company_profile', 'missing'];
    financialFit.missingInformation = ['estimated_tender_value'];
  }

  if (deadlineFit && isDefaultedSerializedScore(deadlineFit)) {
    deadlineFit.score = 70;
    deadlineFit.weightedScore = 2.8;
    deadlineFit.explanation =
      'Submission deadline is not expired; timing is usable if other blockers were resolved.';
    deadlineFit.evidence = ['derived'];
  }
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
      item.explanation = '';
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
  mutable.documentationAnalysis.noticeDocumentsAnalyzedCount =
    mutable.documentationAnalysis.documentsAnalyzedCount ?? 0;
  mutable.documentationAnalysis.procurementDocumentsAnalyzedCount = 0;
  mutable.documentationAnalysis.procurementDocumentsAvailable = hasMissingDocs;
  mutable.documentationAnalysis.procurementDocumentsAccess =
    getSerializedProcurementDocumentsAccess(normalizedMissingDocuments);
  mutable.documentationAnalysis.documentsAnalyzedCount = 0;
  mutable.documentationAnalysis.documentsTotalCount =
    normalizedMissingDocuments.length;
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

function normalizeSerializedDecisionFactors(
  resultJson: TenderDeepAnalysisResult,
): void {
  const mutable = resultJson as unknown as {
    decisionFactors?: { criticalBlockers?: unknown[] };
    bidNoBidDecision?: {
      criticalBlockers?: unknown;
      decisionFactors?: { criticalBlockers?: unknown };
    };
  };
  mutable.decisionFactors ||= {};
  const blockers = Array.isArray(mutable.decisionFactors.criticalBlockers)
    ? mutable.decisionFactors.criticalBlockers
    : [];

  if (Array.isArray(mutable.bidNoBidDecision?.criticalBlockers)) {
    appendSerializedDecisionBlockers(
      blockers,
      mutable.bidNoBidDecision.criticalBlockers,
    );
  }

  if (
    Array.isArray(mutable.bidNoBidDecision?.decisionFactors?.criticalBlockers)
  ) {
    appendSerializedDecisionBlockers(
      blockers,
      mutable.bidNoBidDecision.decisionFactors.criticalBlockers,
    );
  }

  mutable.decisionFactors.criticalBlockers =
    compactSerializedBlockers(blockers);
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

function appendSerializedDecisionBlockers(
  blockers: unknown[],
  values: unknown[],
): void {
  for (const item of values) {
    if (typeof item === 'string') {
      blockers.push({
        type: 'other',
        severity: 'HIGH',
        description: item,
        source: 'bid_decision',
      });
      continue;
    }

    if (!isRecordLike(item) || typeof item.description !== 'string') {
      continue;
    }

    blockers.push({
      type: normalizeSerializedBlockerType(item.type),
      severity: normalizeSerializedBlockerSeverity(item.severity),
      description: item.description,
      source: 'bid_decision',
    });
  }
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

function normalizeSerializedBlockerType(value: unknown): string {
  const normalized = typeof value === 'string' ? value : 'other';

  return [
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
    ? normalized
    : 'other';
}

function normalizeSerializedBlockerSeverity(value: unknown): string {
  const normalized = typeof value === 'string' ? value.toUpperCase() : 'HIGH';

  return ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(normalized)
    ? normalized
    : 'HIGH';
}

function isDefaultedSerializedScore(item: Record<string, unknown>): boolean {
  return (
    item.score === 0 &&
    (item.source === 'backend_fallback' ||
      item.explanationCode === 'MISSING_LLM_SCORE' ||
      (Array.isArray(item.evidence) &&
        item.evidence.includes('backend_fallback')))
  );
}

function compactSerializedBlockers(blockers: unknown[]): unknown[] {
  const byType = new Map<string, Record<string, unknown>>();

  for (const blocker of blockers) {
    if (!isRecordLike(blocker) || typeof blocker.description !== 'string') {
      continue;
    }

    if (blocker.description.trim() === '') {
      continue;
    }

    const type = typeof blocker.type === 'string' ? blocker.type : 'other';
    const current = byType.get(type);

    if (
      !current ||
      severityRank(String(blocker.severity)) >
        severityRank(String(current.severity))
    ) {
      byType.set(type, blocker);
    }
  }

  return [
    'eligibility',
    'capability',
    'certification',
    'geography',
    'financial',
  ]
    .map((type) => byType.get(type))
    .filter(Boolean)
    .map((blocker) => ({
      ...blocker,
      description: String(blocker?.description),
      severity:
        blocker?.type === 'capability' || blocker?.type === 'certification'
          ? 'CRITICAL'
          : blocker?.severity,
    }))
    .slice(0, 5);
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

function severityRank(severity: string): number {
  if (severity === 'CRITICAL') return 4;
  if (severity === 'HIGH') return 3;
  if (severity === 'MEDIUM') return 2;
  return 1;
}

function getScoreWeight(key: CompanyFitScoreKey): number {
  const weights: Record<CompanyFitScoreKey, number> = {
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
  };

  return weights[key];
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

function hasMissingEstimatedValue(
  resultJson: TenderDeepAnalysisResult,
): boolean {
  const estimatedValue = resultJson.tenderIntelligence
    ?.estimatedValue as unknown;

  if (!isRecordLike(estimatedValue)) {
    return true;
  }

  return estimatedValue.amount === null || estimatedValue.amount === undefined;
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
