import { z } from 'zod';
import { TenderDeepAnalysisResult } from '@/types';

export const DEEP_COMPANY_FIT_LLM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'executiveSummary',
    'requirementChecks',
    'companyFitAnalysis',
    'commercialAnalysis',
    'riskAnalysis',
    'documentationAnalysis',
    'clarificationQuestions',
    'bidPreparationPlan',
    'scores',
    'finalRecommendation',
    'bidNoBidDecision',
    'opportunityAnalysis',
  ],
  properties: {
    executiveSummary: {
      type: 'string',
      description:
        'Short localized executive summary of company fit for this tender. Must explain the main recommendation and the most important fit/gap reasons.',
    },

    requirementChecks: {
      type: 'array',
      description:
        'Requirement-level compliance checks. This is the canonical source for PASS, FAIL, UNKNOWN, and PARTIAL compliance.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['requirement', 'isMandatory', 'status', 'explanation'],
        properties: {
          requirement: {
            type: 'string',
            description:
              'The tender requirement being checked, written in outputLanguage.',
          },
          isMandatory: {
            type: 'boolean',
            description:
              'True only if the tender clearly makes this requirement mandatory.',
          },
          status: {
            type: 'string',
            enum: ['PASS', 'PARTIAL', 'UNKNOWN', 'FAIL'],
            description:
              'PASS = company profile explicitly satisfies the requirement. PARTIAL = profile gives a real but incomplete match. UNKNOWN = not enough company profile information. FAIL = explicit contradiction between company profile and tender requirement. Missing information is UNKNOWN, not FAIL.',
          },
          severityIfUnresolved: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
            description:
              'Optional. Importance if this requirement remains unresolved. Required for UNKNOWN, PARTIAL, and FAIL mandatory requirements. Omit for PASS when not relevant.',
          },
          explanation: {
            type: 'string',
            description:
              'Localized explanation. For UNKNOWN, use neutral wording such as “not declared in company profile”. Do not write “company lacks” or “does not meet” unless status is FAIL.',
          },
        },
      },
    },

    companyFitAnalysis: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'strengths', 'weaknesses', 'gaps'],
      properties: {
        summary: {
          type: 'string',
          description:
            'Short localized summary of company fit. Do not repeat every requirement.',
        },
        strengths: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
          description:
            'Top company strengths for this tender. Maximum 5 items.',
        },
        weaknesses: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
          description:
            'High-level weaknesses or missing areas. Do not list every UNKNOWN requirement separately. Maximum 5 items.',
        },
        gaps: {
          type: 'array',
          maxItems: 5,
          description:
            'Grouped company-tender fit gaps for UI display. Use localized title as section heading.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'title',
              'severity',
              'description',
              'mustResolveBeforeBid',
            ],
            properties: {
              title: {
                type: 'string',
                description:
                  'Localized short gap title, e.g. “Эталонные проекты”, “Страхование”, “Финансовые данные”.',
              },
              severity: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
              },
              description: {
                type: 'string',
                description:
                  'Localized explanation. For missing data, do not use proven-failure wording.',
              },
              mustResolveBeforeBid: {
                type: 'boolean',
              },
            },
          },
        },
      },
    },

    commercialAnalysis: {
      type: 'object',
      additionalProperties: false,
      required: [
        'summary',
        'pricingConsiderations',
        'valueFitExplanation',
        'costDrivers',
        'marginRisks',
        'hiddenCosts',
      ],
      properties: {
        summary: { type: 'string' },
        pricingConsiderations: { type: 'string' },
        valueFitExplanation: { type: 'string' },
        costDrivers: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
        },
        marginRisks: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
        },
        hiddenCosts: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
        },
      },
    },

    riskAnalysis: {
      type: 'object',
      additionalProperties: false,
      required: ['tenderRisks', 'companySpecificRisks'],
      properties: {
        tenderRisks: {
          type: 'array',
          items: { $ref: '#/$defs/riskItem' },
        },
        companySpecificRisks: {
          type: 'array',
          items: { $ref: '#/$defs/riskItem' },
        },
      },
    },

    documentationAnalysis: {
      type: 'object',
      additionalProperties: false,
      required: ['missingDocuments'],
      properties: {
        missingDocuments: {
          type: 'array',
          items: { $ref: '#/$defs/missingDocument' },
        },
      },
    },

    clarificationQuestions: {
      type: 'array',
      maxItems: 10,
      items: { $ref: '#/$defs/clarificationQuestion' },
    },

    bidPreparationPlan: {
      type: 'object',
      additionalProperties: false,
      required: [
        'recommendedNextSteps',
        'requiredInternalInputs',
        'requiredExternalInputs',
        'suggestedBidTeamRoles',
        'estimatedPreparationComplexity',
      ],
      properties: {
        recommendedNextSteps: {
          type: 'array',
          items: { $ref: '#/$defs/bidNextStep' },
        },
        requiredInternalInputs: {
          type: 'array',
          items: { type: 'string' },
        },
        requiredExternalInputs: {
          type: 'array',
          items: { type: 'string' },
        },
        suggestedBidTeamRoles: {
          type: 'array',
          items: { type: 'string' },
        },
        estimatedPreparationComplexity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'very_high'],
        },
      },
    },

    scores: {
      type: 'object',
      additionalProperties: false,
      required: [
        'scoreBreakdown',
        'fitScore',
        'fitConfidenceScore',
        'participationReadinessScore',
        'documentationCompletenessScore',
        'requirementsClarityScore',
        'riskScore',
        'opportunityScore',
      ],
      properties: {
        scoreBreakdown: {
          type: 'array',
          minItems: 6,
          maxItems: 12,
          items: { $ref: '#/$defs/scoreBreakdownItem' },
        },
        fitScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description:
            'Overall company-tender fit score from 0 to 100, where higher means better fit.',
        },
        fitConfidenceScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
        participationReadinessScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
        documentationCompletenessScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
        requirementsClarityScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
        riskScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description:
            'Overall risk level from 0 to 100, where higher means higher risk. Do not use this as a fit score.',
        },
        opportunityScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
      },
    },

    finalRecommendation: {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'summary', 'rationale', 'conditions'],
      properties: {
        value: {
          type: 'string',
          enum: [
            'strong_go',
            'go',
            'investigate',
            'caution',
            'no_go',
            'not_actionable',
          ],
          description:
            'Final recommendation. no_go only for proven mandatory FAIL, expired deadline, or impossible submission. UNKNOWN mandatory requirements usually mean investigate, not no_go.',
        },
        summary: { type: 'string' },
        rationale: { type: 'string' },
        conditions: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },

    bidNoBidDecision: {
      type: 'object',
      additionalProperties: false,
      required: [
        'decision',
        'rationale',
        'conditionsForBid',
        'reasonsToDecline',
        'requiredBeforeDecision',
      ],
      properties: {
        decision: {
          type: 'string',
          enum: [
            'strong_bid',
            'bid',
            'bid_if_profile_completed',
            'bid_if_gaps_resolved',
            'no_bid',
            'not_actionable',
          ],
          description: 'Must be consistent with finalRecommendation.value.',
        },
        rationale: { type: 'string' },
        conditionsForBid: {
          type: 'array',
          items: { type: 'string' },
        },
        reasonsToDecline: {
          type: 'array',
          items: { type: 'string' },
        },
        requiredBeforeDecision: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },

    opportunityAnalysis: {
      type: 'object',
      additionalProperties: false,
      required: [
        'summary',
        'whyThisCouldBeAttractive',
        'whyThisMayNotBeWorthIt',
        'likelyCompetitionLevel',
      ],
      properties: {
        summary: { type: 'string' },
        whyThisCouldBeAttractive: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
        },
        whyThisMayNotBeWorthIt: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
        },
        likelyCompetitionLevel: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'unknown'],
        },
      },
    },
  },

  $defs: {
    riskItem: {
      type: 'object',
      additionalProperties: false,
      required: [
        'title',
        'severity',
        'probability',
        'description',
        'businessImpact',
      ],
      properties: {
        title: {
          type: 'string',
          description: 'Localized risk title for UI display.',
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
        },
        probability: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'unknown'],
        },
        description: { type: 'string' },
        businessImpact: { type: 'string' },
        mitigation: { type: 'string' },
      },
    },

    missingDocument: {
      type: 'object',
      additionalProperties: false,
      required: [
        'name',
        'documentCategory',
        'importance',
        'status',
        'description',
        'whyNeeded',
        'impactIfMissing',
        'possibleUrls',
        'recommendedAction',
      ],
      properties: {
        name: { type: 'string' },
        documentCategory: {
          type: 'string',
          description:
            'Short localized category name for grouping related missing documents in the UI.',
        },
        importance: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
        status: {
          type: 'string',
          enum: [
            'MISSING',
            'PORTAL_LINK_AVAILABLE',
            'DIRECT_LINK_AVAILABLE',
            'NOT_REQUIRED',
            'ALREADY_ANALYZED',
            'UNKNOWN',
          ],
        },
        description: { type: 'string' },
        whyNeeded: { type: 'string' },
        impactIfMissing: { type: 'string' },
        portalUrl: {
          type: ['string', 'null'],
        },
        directDownloadUrl: {
          type: ['string', 'null'],
        },
        possibleUrls: {
          type: 'array',
          items: { type: 'string' },
        },
        recommendedAction: { type: 'string' },
      },
    },

    clarificationQuestion: {
      type: 'object',
      additionalProperties: false,
      required: ['priority', 'question', 'reason'],
      properties: {
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
        },
        question: { type: 'string' },
        reason: { type: 'string' },
        questionCategory: {
          type: 'string',
          description:
            'Short localized category for grouping clarification questions in the UI.',
        },
        companyImpact: { type: 'string' },
      },
    },

    bidNextStep: {
      type: 'object',
      additionalProperties: false,
      required: ['priority', 'action', 'reason', 'ownerRole', 'dueTiming'],
      properties: {
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
        },
        action: { type: 'string' },
        reason: { type: 'string' },
        ownerRole: {
          type: 'string',
          description:
            "Short localized role or team responsible for this step, suitable for UI display. Examples: 'Bid Manager', 'Finance', 'Legal', 'Technical Lead', 'Sales', 'Management', 'Partner Manager', or another appropriate role.",
        },
        dueTiming: {
          type: 'string',
          enum: [
            'immediate',
            'before_questions_deadline',
            'before_submission',
            'after_gap_review',
            'optional',
          ],
        },
      },
    },

    scoreBreakdownItem: {
      type: 'object',
      additionalProperties: false,
      required: ['criterion', 'score', 'explanation'],
      properties: {
        criterion: {
          type: 'string',
          description:
            "Short score category name, such as 'Scope Fit', 'Technical Fit', 'Experience', 'Financial Capacity', 'Language', 'Commercial Fit', 'Risk', or another relevant evaluation area.",
        },
        score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description:
            'Criterion score from 0 to 100. UNKNOWN should be neutral-low, not zero. FAIL should be low.',
        },
        explanation: { type: 'string' },
      },
    },
  },
} as const;

const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);
const importanceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const prioritySchema = z.enum(['high', 'medium', 'low']);
const scoreSchema = z.number().min(0).max(100);

const riskItemSchema = z
  .object({
    title: z.string(),
    severity: severitySchema,
    probability: z.enum(['low', 'medium', 'high', 'unknown']),
    description: z.string(),
    businessImpact: z.string(),
    mitigation: z.string().optional(),
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
        fitConfidenceScore: scoreSchema,
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
