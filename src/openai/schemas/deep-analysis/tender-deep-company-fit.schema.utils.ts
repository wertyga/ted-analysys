import { z } from 'zod';
import { TenderDeepAnalysisResult } from '@/types';
import { DEEP_COMPANY_FIT_LLM_JSON_SCHEMA } from './tender-deep-company-fit.schema';

const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);
const importanceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const prioritySchema = z.enum(['high', 'medium', 'low']);
const scoreSchema = z.number().min(0).max(100);

const evidenceReferenceSchema = z
  .object({
    sourceType: z.enum([
      'structured_ted',
      'ted_xml',
      'ted_pdf',
      'tender_document',
      'general_analysis',
      'company_profile',
      'company_document',
      'derived_metadata',
    ]),
    documentName: z.string().optional(),
    section: z.string().optional(),
    url: z.string().optional(),
  })
  .strict();

const riskItemSchema = z
  .object({
    title: z.string(),
    severity: severitySchema,
    probability: z.enum(['low', 'medium', 'high', 'unknown']),
    description: z.string(),
    businessImpact: z.string(),
    mitigation: z.string().optional(),
    evidenceReferences: z.array(evidenceReferenceSchema).optional(),
    evidenceQuote: z.string().optional(),
  })
  .strict();

const missingDocumentSchema = z
  .object({
    name: z.string(),
    documentCategory: z.string(),
    importance: importanceSchema,
    status: z.enum([
      'MISSING',
      'PORTAL_LINK_AVAILABLE',
      'DIRECT_LINK_AVAILABLE',
      'NOT_REQUIRED',
      'ALREADY_ANALYZED',
      'UNKNOWN',
    ]),
    description: z.string(),
    whyNeeded: z.string(),
    impactIfMissing: z.string(),
    portalUrl: z.string().nullable().optional(),
    directDownloadUrl: z.string().nullable().optional(),
    possibleUrls: z.array(z.string()),
    recommendedAction: z.string(),
  })
  .strict();

export const TENDER_DEEP_COMPANY_FIT_LLM_RESPONSE_SCHEMA = z
  .object({
    executiveSummary: z.string(),
    requirementChecks: z.array(
      z
        .object({
          requirement: z.string(),
          isMandatory: z.boolean(),
          status: z.enum(['PASS', 'PARTIAL', 'UNKNOWN', 'FAIL']),
          severityIfUnresolved: importanceSchema.optional(),
          explanation: z.string(),
          evidenceReferences: z.array(evidenceReferenceSchema).optional(),
          evidenceQuote: z.string().optional(),
        })
        .strict(),
    ),
    companyFitAnalysis: z
      .object({
        summary: z.string(),
        strengths: z.array(z.string()).max(5),
        weaknesses: z.array(z.string()).max(5),
        gaps: z
          .array(
            z
              .object({
                title: z.string(),
                severity: severitySchema,
                description: z.string(),
                mustResolveBeforeBid: z.boolean(),
              })
              .strict(),
          )
          .max(5),
      })
      .strict(),
    commercialAnalysis: z
      .object({
        summary: z.string(),
        pricingConsiderations: z.string(),
        valueFitExplanation: z.string(),
        costDrivers: z.array(z.string()).max(5),
        marginRisks: z.array(z.string()).max(5),
        hiddenCosts: z.array(z.string()).max(5),
      })
      .strict(),
    riskAnalysis: z
      .object({
        tenderRisks: z.array(riskItemSchema),
        companySpecificRisks: z.array(riskItemSchema),
      })
      .strict(),
    documentationAnalysis: z
      .object({ missingDocuments: z.array(missingDocumentSchema) })
      .strict(),
    clarificationQuestions: z
      .array(
        z
          .object({
            priority: prioritySchema,
            question: z.string(),
            reason: z.string(),
            questionCategory: z.string().optional(),
            companyImpact: z.string().optional(),
            evidenceReferences: z.array(evidenceReferenceSchema).optional(),
            evidenceQuote: z.string().optional(),
          })
          .strict(),
      )
      .max(10),
    bidPreparationPlan: z
      .object({
        recommendedNextSteps: z.array(
          z
            .object({
              priority: prioritySchema,
              action: z.string(),
              reason: z.string(),
              ownerRole: z.string(),
              dueTiming: z.enum([
                'immediate',
                'before_questions_deadline',
                'before_submission',
                'after_gap_review',
                'optional',
              ]),
            })
            .strict(),
        ),
        requiredInternalInputs: z.array(z.string()),
        requiredExternalInputs: z.array(z.string()),
        suggestedBidTeamRoles: z.array(z.string()),
        estimatedPreparationComplexity: z.enum([
          'low',
          'medium',
          'high',
          'very_high',
        ]),
      })
      .strict(),
    scores: z
      .object({
        scoreBreakdown: z
          .array(
            z
              .object({
                criterion: z.string(),
                score: scoreSchema,
                explanation: z.string(),
              })
              .strict(),
          )
          .min(6)
          .max(12),
        fitScore: scoreSchema,
        participationReadinessScore: scoreSchema,
        documentationCompletenessScore: scoreSchema,
        requirementsClarityScore: scoreSchema,
        riskScore: scoreSchema,
        opportunityScore: scoreSchema,
      })
      .strict(),
    finalRecommendation: z
      .object({
        value: z.enum([
          'strong_go',
          'go',
          'investigate',
          'caution',
          'no_go',
          'not_actionable',
        ]),
        summary: z.string(),
        rationale: z.string(),
        conditions: z.array(z.string()),
      })
      .strict(),
    bidNoBidDecision: z
      .object({
        decision: z.enum([
          'strong_bid',
          'bid',
          'bid_if_profile_completed',
          'bid_if_gaps_resolved',
          'no_bid',
          'not_actionable',
        ]),
        rationale: z.string(),
        conditionsForBid: z.array(z.string()),
        reasonsToDecline: z.array(z.string()),
        requiredBeforeDecision: z.array(z.string()),
      })
      .strict(),
    opportunityAnalysis: z
      .object({
        summary: z.string(),
        whyThisCouldBeAttractive: z.array(z.string()).max(5),
        whyThisMayNotBeWorthIt: z.array(z.string()).max(5),
        likelyCompetitionLevel: z.enum(['low', 'medium', 'high', 'unknown']),
      })
      .strict(),
    buyerSelectionAssessment: z
      .object({
        probabilityScore: scoreSchema,
        probabilityLevel: z.enum(['low', 'medium', 'high', 'unknown']),
        summary: z.string(),
        rationale: z.string(),
        positiveFactors: z.array(z.string()).max(5),
        negativeFactors: z.array(z.string()).max(5),
        assumptions: z.array(z.string()).max(5),
        buyerSignalsUsed: z.array(z.string()).max(5),
      })
      .strict(),
  })
  .strict();

export function validateTenderDeepCompanyFitResult(
  value: unknown,
):
  | { success: true; data: TenderDeepAnalysisResult }
  | { success: false; error: z.ZodError } {
  return TENDER_DEEP_COMPANY_FIT_LLM_RESPONSE_SCHEMA.safeParse(value);
}

const DEEP_COMPANY_FIT_ENUM_DEFAULTS: Record<string, string> = {
  'requirementChecks.status': 'UNKNOWN',
  'requirementChecks.severityIfUnresolved': 'MEDIUM',
  'documentationAnalysis.missingDocuments.importance': 'MEDIUM',
  'documentationAnalysis.missingDocuments.status': 'UNKNOWN',
  'riskAnalysis.tenderRisks.probability': 'unknown',
  'riskAnalysis.companySpecificRisks.probability': 'unknown',
  'bidPreparationPlan.estimatedPreparationComplexity': 'high',
  'bidPreparationPlan.recommendedNextSteps.dueTiming': 'immediate',
  'finalRecommendation.value': 'investigate',
  'bidNoBidDecision.decision': 'bid_if_profile_completed',
  'opportunityAnalysis.likelyCompetitionLevel': 'unknown',
  'buyerSelectionAssessment.probabilityLevel': 'unknown',
};

/**
 * Repairs an invalid provider response without discarding valid sibling fields.
 * The returned value is guaranteed to pass the canonical runtime schema.
 */
export function normalizeTenderDeepCompanyFitResult(
  value: unknown,
): TenderDeepAnalysisResult {
  const normalized = normalizeByJsonSchema(
    value,
    DEEP_COMPANY_FIT_LLM_JSON_SCHEMA,
    [],
  );
  const validation = validateTenderDeepCompanyFitResult(normalized);

  if (!validation.success) {
    throw new Error(
      `Failed to normalize deep company-fit result: ${validation.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  return validation.data;
}

function normalizeByJsonSchema(
  value: unknown,
  schema: Record<string, any>,
  path: string[],
): unknown {
  if (schema.$ref) {
    const definitionName = String(schema.$ref).split('/').at(-1);
    const definition = definitionName
      ? (DEEP_COMPANY_FIT_LLM_JSON_SCHEMA.$defs as Record<string, any>)[
          definitionName
        ]
      : undefined;

    if (!definition) {
      throw new Error(
        `Unknown deep company-fit schema reference: ${schema.$ref}`,
      );
    }

    return normalizeByJsonSchema(value, definition, path);
  }

  if (Array.isArray(schema.type)) {
    if (schema.type.includes('null') && value === null) {
      return null;
    }

    const nonNullType = schema.type.find((type: string) => type !== 'null');
    return normalizeByJsonSchema(value, { ...schema, type: nonNullType }, path);
  }

  if (schema.type === 'object') {
    const input = isPlainRecord(value) ? value : {};
    const required = new Set<string>(schema.required ?? []);

    return Object.fromEntries(
      Object.entries<Record<string, any>>(schema.properties ?? {}).flatMap(
        ([key, propertySchema]) => {
          if (!required.has(key) && !(key in input)) {
            return [];
          }

          return [
            [
              key,
              normalizeByJsonSchema(input[key], propertySchema, [...path, key]),
            ],
          ];
        },
      ),
    );
  }

  if (schema.type === 'array') {
    const input = Array.isArray(value) ? value : [];
    const items = input.map((item) =>
      normalizeByJsonSchema(item, schema.items, path),
    );
    const minimum = schema.minItems ?? 0;

    while (items.length < minimum) {
      items.push(normalizeByJsonSchema(undefined, schema.items, path));
    }

    return typeof schema.maxItems === 'number'
      ? items.slice(0, schema.maxItems)
      : items;
  }

  if (schema.type === 'string') {
    if (schema.enum) {
      if (typeof value === 'string' && schema.enum.includes(value)) {
        return value;
      }

      const pathKey = path.join('.');
      return (
        DEEP_COMPANY_FIT_ENUM_DEFAULTS[pathKey] ??
        getGenericEnumDefault(schema.enum)
      );
    }

    return typeof value === 'string' ? value : '';
  }

  if (schema.type === 'number') {
    const number =
      typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return Math.min(
      schema.maximum ?? number,
      Math.max(schema.minimum ?? number, number),
    );
  }

  if (schema.type === 'boolean') {
    return typeof value === 'boolean' ? value : false;
  }

  return value;
}

function getGenericEnumDefault(values: readonly string[]): string {
  return (
    values.find((value) => value === 'unknown' || value === 'UNKNOWN') ??
    values.find((value) => value === 'medium' || value === 'MEDIUM') ??
    values[0]
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
