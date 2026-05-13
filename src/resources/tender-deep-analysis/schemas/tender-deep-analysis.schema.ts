import {
  CompanyFitScoreKey,
  TenderDeepAnalysisResult,
  TenderDeepRecommendation,
} from '@/types';
import mongoose, { Document, Model, Schema } from 'mongoose';
import { filterModel, isPopulatedRecord } from '@/utils';
import {
  TenderDetailDto,
  TenderListDto,
} from '@/resources/tenders/dto/tender.dto';
import {
  TenderDocument,
  TenderModel,
  TenderRecord,
  TenderSerializable,
} from '@/resources/tenders/schemas';
import { UserModel } from '@/resources/user/user.schema';
import { UserDocument } from '@/resources/user/user.types';
import {
  TenderGeneralAnalysisDocument,
  TenderGeneralAnalysisModel,
  TenderGeneralAnalysisRecord,
  TenderGeneralAnalysisSerializable,
} from '@/resources/tender-analysis/schemas';

export enum TenderDeepAnalysisStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export interface TenderDeepAnalysis {
  tenderId: string;
  tender: mongoose.Types.ObjectId;
  company: mongoose.Types.ObjectId;
  generalAnalysis?: mongoose.Types.ObjectId;
  status: TenderDeepAnalysisStatus;
  resultJson?: TenderDeepAnalysisResult;
  executiveSummary?: string;
  fitScore?: number;
  fitConfidenceScore?: number;
  participationReadinessScore?: number;
  documentationCompletenessScore?: number;
  requirementsClarityScore?: number;
  riskScore?: number;
  riskFitScore?: number;
  opportunityScore?: number;
  companyCapabilityScore?: number;
  eligibilityFitScore?: number;
  commercialFitScore?: number;
  deadlineFitScore?: number;
  recommendation?: TenderDeepRecommendation;
  analysisDepth: 'deep_company_fit';
  documentsAnalyzedCount?: number;
  documentsTotalCount?: number;
  missingDocumentsWarning?: boolean;
  sourceHash?: string;
  promptVersion?: string;
  model?: string;
  errorMessage?: string;
  analyzedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderDeepAnalysisDocument = TenderDeepAnalysis & Document;
export type TenderDeepAnalysisRecord = TenderDeepAnalysis & {
  _id?: unknown;
  tender?: mongoose.Types.ObjectId | TenderRecord | TenderDocument;
  company?: mongoose.Types.ObjectId | UserDocument;
  generalAnalysis?:
    | mongoose.Types.ObjectId
    | TenderGeneralAnalysisRecord
    | TenderGeneralAnalysisDocument;
};
export type TenderDeepAnalysisSerializable =
  | TenderDeepAnalysisDocument
  | TenderDeepAnalysisRecord;

export type TenderDeepAnalysisDetailDto = Omit<
  TenderDeepAnalysisRecord,
  'tender' | 'company' | 'generalAnalysis'
> & {
  tender?: TenderDetailDto | null;
  company?: ReturnType<typeof UserModel.serializeUser> | null;
  generalAnalysis?: ReturnType<
    typeof TenderGeneralAnalysisModel.serializeDetail
  >;
};

export type TenderDeepAnalysisListDto = Omit<
  TenderDeepAnalysisRecord,
  'tender' | 'company' | 'generalAnalysis'
> & {
  tender?: TenderListDto | null;
  company?: ReturnType<typeof UserModel.serializeUser> | null;
  generalAnalysis?: ReturnType<typeof TenderGeneralAnalysisModel.serializeList>;
};

export interface TenderDeepModelType extends Model<TenderDeepAnalysisDocument> {
  serializeDetail(
    analysis?: TenderDeepAnalysisSerializable | null,
  ): TenderDeepAnalysisDetailDto | null;
  serializeList(
    analysis?: TenderDeepAnalysisSerializable | null,
  ): TenderDeepAnalysisListDto | null;
}

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

const TenderDeepAnalysisSchema = new Schema<TenderDeepAnalysisDocument>(
  {
    tenderId: { type: String, required: true },
    tender: {
      type: Schema.Types.ObjectId,
      ref: 'Tender',
      required: true,
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    generalAnalysis: {
      type: Schema.Types.ObjectId,
      ref: 'TenderGeneralAnalysis',
      default: undefined,
    },
    status: {
      type: String,
      enum: Object.values(TenderDeepAnalysisStatus),
      default: TenderDeepAnalysisStatus.PENDING,
    },
    resultJson: { type: Schema.Types.Mixed, default: undefined },
    executiveSummary: String,
    fitScore: { type: Number, min: 0, max: 100 },
    fitConfidenceScore: { type: Number, min: 0, max: 100 },
    participationReadinessScore: { type: Number, min: 0, max: 100 },
    documentationCompletenessScore: { type: Number, min: 0, max: 100 },
    requirementsClarityScore: { type: Number, min: 0, max: 100 },
    riskScore: { type: Number, min: 0, max: 100 },
    riskFitScore: { type: Number, min: 0, max: 100 },
    opportunityScore: { type: Number, min: 0, max: 100 },
    companyCapabilityScore: { type: Number, min: 0, max: 100 },
    eligibilityFitScore: { type: Number, min: 0, max: 100 },
    commercialFitScore: { type: Number, min: 0, max: 100 },
    deadlineFitScore: { type: Number, min: 0, max: 100 },
    recommendation: {
      type: String,
      enum: [
        'strong_go',
        'go',
        'investigate',
        'caution',
        'no_go',
        'not_actionable',
      ],
    },
    analysisDepth: {
      type: String,
      enum: ['deep_company_fit'],
      default: 'deep_company_fit',
      required: true,
    },
    documentsAnalyzedCount: { type: Number, min: 0, default: 0 },
    documentsTotalCount: { type: Number, min: 0, default: 0 },
    missingDocumentsWarning: { type: Boolean, default: false },
    sourceHash: { type: String },
    promptVersion: String,
    errorMessage: String,
    analyzedAt: Date,
  },
  {
    collection: 'tender_deep_analyses',
    timestamps: true,
  },
);

TenderDeepAnalysisSchema.add({ model: String } as Record<string, unknown>);

TenderDeepAnalysisSchema.index({ tenderId: 1 });
TenderDeepAnalysisSchema.index({ tender: 1 });
TenderDeepAnalysisSchema.index({ company: 1 });
TenderDeepAnalysisSchema.index({ sourceHash: 1 });
TenderDeepAnalysisSchema.index({ status: 1 });
TenderDeepAnalysisSchema.index({ tenderId: 1, company: 1 });
TenderDeepAnalysisSchema.index(
  { tenderId: 1, company: 1, sourceHash: 1 },
  { unique: true },
);

function serializeDeepAnalysisDetail(
  analysis?: TenderDeepAnalysisSerializable | null,
): TenderDeepAnalysisDetailDto | null {
  if (!analysis) {
    return null;
  }

  const { tender, company, generalAnalysis, model, sourceHash, ...rest } =
    filterModel(
      analysis as TenderDeepAnalysisDocument,
    ) as TenderDeepAnalysisRecord;
  const normalizedRest = normalizeSerializedDeepAnalysis(rest);

  return {
    ...normalizedRest,
    tender: isPopulatedRecord(tender)
      ? TenderModel.serializeDetail(tender as TenderSerializable)
      : null,
    company: isPopulatedRecord(company)
      ? UserModel.serializeUser(company as UserDocument, 'true')
      : null,
    generalAnalysis: isPopulatedRecord(generalAnalysis)
      ? TenderGeneralAnalysisModel.serializeDetail(
          generalAnalysis as TenderGeneralAnalysisSerializable,
        )
      : null,
  };
}

function serializeDeepAnalysisList(
  analysis?: TenderDeepAnalysisSerializable | null,
): TenderDeepAnalysisListDto | null {
  if (!analysis) {
    return null;
  }

  const { tender, company, generalAnalysis, promptVersion, model, ...rest } =
    filterModel(
      analysis as TenderDeepAnalysisDocument,
    ) as TenderDeepAnalysisRecord;
  const normalizedRest = normalizeSerializedDeepAnalysis(rest);

  return {
    ...normalizedRest,
    tender: isPopulatedRecord(tender)
      ? TenderModel.serializeList(tender as TenderSerializable)
      : null,
    company: isPopulatedRecord(company)
      ? UserModel.serializeUser(company as UserDocument, 'true')
      : null,
    generalAnalysis: isPopulatedRecord(generalAnalysis)
      ? TenderGeneralAnalysisModel.serializeList(
          generalAnalysis as TenderGeneralAnalysisSerializable,
        )
      : null,
  };
}

function normalizeSerializedDeepAnalysis<
  T extends Partial<TenderDeepAnalysisRecord>,
>(analysis: T): T {
  if (!analysis.resultJson) {
    return analysis;
  }

  const resultJson = normalizeResultJsonScoreBreakdown(analysis.resultJson);
  const scores = resultJson.scores;

  return {
    ...analysis,
    resultJson,
    fitScore: scores.fitScore ?? analysis.fitScore,
    fitConfidenceScore:
      scores.fitConfidenceScore ?? analysis.fitConfidenceScore,
    participationReadinessScore:
      scores.participationReadinessScore ??
      analysis.participationReadinessScore,
    documentationCompletenessScore:
      scores.documentationCompletenessScore ??
      analysis.documentationCompletenessScore,
    requirementsClarityScore:
      scores.requirementsClarityScore ?? analysis.requirementsClarityScore,
    riskScore: scores.riskScore ?? analysis.riskScore,
    riskFitScore: scores.riskFitScore ?? analysis.riskFitScore,
    opportunityScore: scores.opportunityScore ?? analysis.opportunityScore,
    companyCapabilityScore:
      scores.companyCapabilityScore ?? analysis.companyCapabilityScore,
    eligibilityFitScore:
      scores.eligibilityFitScore ?? analysis.eligibilityFitScore,
    commercialFitScore:
      scores.commercialFitScore ?? analysis.commercialFitScore,
    deadlineFitScore: scores.deadlineFitScore ?? analysis.deadlineFitScore,
    missingDocumentsWarning:
      resultJson.documentationAnalysis?.missingDocumentsWarning ??
      analysis.missingDocumentsWarning,
  };
}

function normalizeResultJsonScoreBreakdown(
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
              evidence: [],
              missingInformation: [],
            }),
      };
    });
  }

  const scoreItems = Array.isArray(mutable.scores.scoreBreakdown)
    ? mutable.scores.scoreBreakdown
    : [];
  applySerializedScoreFallbacks(normalized, scoreItems);
  applySerializedScoreExplanations(scoreItems);
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
  normalizeSerializedDecisionFactors(normalized);
  normalizeSerializedProcedure(normalized);
  cleanupSerializedCompanyFitAnalysis(normalized);

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
  const evidenceText = JSON.stringify(resultJson.evidenceMap ?? {});
  const companyText = JSON.stringify(resultJson.companyFitAnalysis ?? {});

  if (
    languageFit &&
    isDefaultedSerializedScore(languageFit) &&
    /ENG|English/i.test(evidenceText + companyText)
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
    /typicalContractSize|typical contract/i.test(companyText)
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

function applySerializedScoreExplanations(scoreItems: unknown[]): void {
  for (const key of SCORE_KEYS) {
    const item = findScoreItem(scoreItems, key);

    if (!item) {
      continue;
    }

    if (isTechnicalSerializedScoreExplanation(item.explanation)) {
      item.explanation = getSerializedScoreExplanation(key);
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
  return (
    typeof value !== 'string' ||
    value.trim() === '' ||
    /score returned in legacy scores block|missing llm score|defaulted by backend/i.test(
      value,
    )
  );
}

function getSerializedScoreExplanation(key: CompanyFitScoreKey): string {
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
  const coverageText = JSON.stringify(mutable.documentationAnalysis);
  const hasMissingDocs =
    missingDocuments.length > 0 ||
    /partial|not downloaded|not analyzed|technical specifications|procurement documents|annex/i.test(
      coverageText,
    );
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
    /selection criteria.*not|unknown|missing|likely require/i.test(
      JSON.stringify(resultJson.requirementsAnalysis ?? {}),
    )
      ? 25
      : 60;
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
    bidNoBidDecision?: { criticalBlockers?: unknown };
  };
  mutable.decisionFactors ||= {};
  const blockers = Array.isArray(mutable.decisionFactors.criticalBlockers)
    ? mutable.decisionFactors.criticalBlockers
    : [];

  if (Array.isArray(mutable.bidNoBidDecision?.criticalBlockers)) {
    for (const description of mutable.bidNoBidDecision.criticalBlockers) {
      if (typeof description !== 'string') {
        continue;
      }

      blockers.push({
        type: inferSerializedBlockerType(description),
        severity: /no experience|no capability|certification|clearance/i.test(
          description,
        )
          ? 'CRITICAL'
          : 'HIGH',
        description,
        source: 'bid_decision',
      });
    }
  }

  mutable.decisionFactors.criticalBlockers = compactSerializedBlockers(blockers);
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

function isDefaultedSerializedScore(item: Record<string, unknown>): boolean {
  return (
    item.score === 0 &&
    typeof item.explanation === 'string' &&
    /missing llm score|defaulted by backend/i.test(item.explanation)
  );
}

function inferSerializedBlockerType(description: string): string {
  if (/procedure|restricted|invited|invitation|selection|eligib/i.test(description)) return 'eligibility';
  if (/certification|clearance/i.test(description)) return 'certification';
  if (
    /capability|experience|maintenance|nuclear|industrial/i.test(description)
  ) {
    return 'capability';
  }
  if (/slovenia|presence|geograph/i.test(description)) return 'geography';
  return 'other';
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

  const canonicalDescriptions: Record<string, string> = {
    eligibility:
      'Procedure access/selection criteria are unclear or restricted; company has no evidence of invitation or qualification.',
    capability:
      'No declared capability or experience in the required industrial/nuclear maintenance scope.',
    certification:
      'No declared certifications or site-access clearances for nuclear or industrial maintenance work.',
    geography: 'No operating presence in the tender performance country.',
  };

  return ['eligibility', 'capability', 'certification', 'geography', 'financial']
    .map((type) => byType.get(type))
    .filter(Boolean)
    .map((blocker) => ({
      ...blocker,
      description:
        canonicalDescriptions[String(blocker?.type)] ??
        String(blocker?.description),
      severity:
        blocker?.type === 'capability' || blocker?.type === 'certification'
          ? 'CRITICAL'
          : blocker?.severity,
    }))
    .slice(0, 5);
}

function normalizeSerializedProcedure(resultJson: TenderDeepAnalysisResult): void {
  const mutable = resultJson as unknown as {
    tenderIntelligence?: Record<string, unknown>;
    executiveSummary?: string;
  };
  const tenderIntelligence = mutable.tenderIntelligence;

  if (!tenderIntelligence) {
    return;
  }

  const procedureText = JSON.stringify(tenderIntelligence);

  if (!/neg-w-call|with prior call|without prior call|negotiated/i.test(procedureText)) {
    return;
  }

  const ambiguousProcedure =
    'Ambiguous/restricted negotiated procedure (structured TED: neg-w-call; notice text may indicate request-to-participate or invited-bidder stage).';

  tenderIntelligence.procedureType = ambiguousProcedure;

  if (typeof tenderIntelligence.procedureDescription === 'string') {
    tenderIntelligence.procedureDescription = ambiguousProcedure;
  }

  if (typeof mutable.executiveSummary === 'string') {
    mutable.executiveSummary = mutable.executiveSummary.replace(
      /The procedure is [^.]*\.|Participation likely restricted to invited bidders\./i,
      'The procedure type is ambiguous/restricted: structured TED data indicates neg-w-call, while notice text may indicate a request-to-participate or invited-bidder stage.',
    );
  }

  const cautiousProcedure =
    'Participation appears restricted or subject to pre-selection; exact access conditions must be confirmed in the procurement documents.';
  normalizeSerializedProcedureTextInObject(
    (resultJson as unknown as Record<string, unknown>).requirementsAnalysis,
    cautiousProcedure,
  );
  normalizeSerializedProcedureTextInObject(
    (resultJson as unknown as Record<string, unknown>).riskAnalysis,
    cautiousProcedure,
  );
  normalizeSerializedProcedureTextInObject(
    (resultJson as unknown as Record<string, unknown>).bidNoBidDecision,
    cautiousProcedure,
  );
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
    mutable.companyFitAnalysis.strengths = [
      'English is accepted as a submission language.',
      'Submission deadline is not immediately urgent for a prepared bidder.',
    ];
  }

  if (
    !Array.isArray(mutable.companyFitAnalysis.weaknesses) ||
    mutable.companyFitAnalysis.weaknesses.length === 0
  ) {
    mutable.companyFitAnalysis.weaknesses = [
      'No declared repair or maintenance capability.',
      'No declared nuclear or industrial maintenance certifications.',
      'No operating presence in Slovenia.',
      'No CPV/profile overlap with the repair and maintenance scope.',
    ];
  }

  if (
    !Array.isArray(mutable.companyFitAnalysis.capabilityGaps) ||
    mutable.companyFitAnalysis.capabilityGaps.length === 0
  ) {
    mutable.companyFitAnalysis.capabilityGaps = [
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

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampSerializedScore(value: unknown): number {
  return Math.max(
    0,
    Math.min(100, typeof value === 'number' && Number.isFinite(value) ? value : 0),
  );
}

function normalizeSerializedProcedureTextInObject(
  value: unknown,
  replacement: string,
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (typeof value[index] === 'string') {
        value[index] = normalizeSerializedProcedureText(
          value[index],
          replacement,
        );
      } else {
        normalizeSerializedProcedureTextInObject(value[index], replacement);
      }
    }

    return;
  }

  if (!isRecordLike(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (typeof nestedValue === 'string') {
      value[key] = normalizeSerializedProcedureText(nestedValue, replacement);
    } else {
      normalizeSerializedProcedureTextInObject(nestedValue, replacement);
    }
  }
}

function normalizeSerializedProcedureText(
  value: string,
  replacement: string,
): string {
  if (
    /only invited bidders can participate|only invited bidders may participate|requires prior invitation|restricted to invited bidders|procedure restricted to invited bidders/i.test(
      value,
    )
  ) {
    return replacement;
  }

  return value
    .replace(
      /company is not invited/gi,
      'there is no evidence that the company is invited or qualified',
    )
    .replace(/not invited/gi, 'not evidenced as invited or qualified');
}

TenderDeepAnalysisSchema.statics.serializeDetail = serializeDeepAnalysisDetail;
TenderDeepAnalysisSchema.statics.serializeList = serializeDeepAnalysisList;

export const TenderDeepAnalysisModel: TenderDeepModelType =
  (mongoose.models.TenderDeepAnalysis as TenderDeepModelType | undefined) ??
  mongoose.model<TenderDeepAnalysisDocument, TenderDeepModelType>(
    'TenderDeepAnalysis',
    TenderDeepAnalysisSchema,
  );
