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
          evidenceReferences: {
            type: 'array',
            items: { $ref: '#/$defs/evidenceReference' },
            description:
              'Optional references showing where this requirement or finding was found. Use only sources provided in the input. Omit if no reliable source reference is available.',
          },
          evidenceQuote: {
            type: 'string',
            description:
              'Optional short quote or paraphrased excerpt from the source that supports the requirement. Use the original source language if useful. Omit if no reliable quote is available.',
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
                description:
                  'Severity of this grouped fit gap if it remains unresolved.',
              },
              description: {
                type: 'string',
                description:
                  'Localized explanation. For missing data, do not use proven-failure wording.',
              },
              mustResolveBeforeBid: {
                type: 'boolean',
                description:
                  'True if this gap must be resolved before submitting a serious bid.',
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
        summary: {
          type: 'string',
          description:
            'Localized short commercial summary. Explain commercial attractiveness, budget uncertainty, framework/no-minimum-volume issues, and pricing implications.',
        },
        pricingConsiderations: {
          type: 'string',
          description:
            'Localized pricing guidance. Explain what should be considered when preparing price, rates, assumptions, and competitiveness.',
        },
        valueFitExplanation: {
          type: 'string',
          description:
            'Localized explanation of whether the opportunity size and commercial model fit the company profile. Do not invent budget values.',
        },
        costDrivers: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
          description:
            'Main cost drivers for preparing and delivering the tender. Maximum 5 localized items.',
        },
        marginRisks: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
          description:
            'Main risks that could reduce margin or make the contract commercially unattractive. Maximum 5 localized items.',
        },
        hiddenCosts: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
          description:
            'Possible hidden or indirect costs. Maximum 5 localized items. Do not invent costs not supported by tender context.',
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
          description:
            'Risks caused by the tender itself, such as unclear budget, unclear deadline, strict procedure, no minimum volume, or ambiguous documents.',
          items: { $ref: '#/$defs/riskItem' },
        },
        companySpecificRisks: {
          type: 'array',
          description:
            'Risks caused by the current company-tender fit, such as unconfirmed qualification requirements, missing evidence, or unresolved capability fit.',
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
          description:
            'Documents or evidence that must be collected, verified, uploaded, or prepared before bidding. Use neutral wording: missing from provided data does not prove the company lacks it.',
          items: { $ref: '#/$defs/missingDocument' },
        },
      },
    },

    clarificationQuestions: {
      type: 'array',
      maxItems: 10,
      description:
        'Questions to ask the buyer or clarify internally before deciding or submitting. Focus on issues that materially affect eligibility, price, scope, deadline, or bid strategy.',
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
          description:
            'Concrete next actions required before bid/no-bid decision or submission. Sort by urgency and priority.',
          items: { $ref: '#/$defs/bidNextStep' },
        },
        requiredInternalInputs: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Localized list of information or documents that must be collected from inside the company.',
        },
        requiredExternalInputs: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Localized list of information, documents, confirmations, or clarifications needed from external parties.',
        },
        suggestedBidTeamRoles: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Localized list of roles that should participate in preparing the bid.',
        },
        estimatedPreparationComplexity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'very_high'],
          description:
            'Estimated complexity of preparing a compliant bid based on time, documents, risks, and missing information.',
        },
      },
    },

    scores: {
      type: 'object',
      additionalProperties: false,
      required: [
        'scoreBreakdown',
        'fitScore',
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
          description:
            'Detailed scoring factors used to explain the overall assessment. Use localized criterion names.',
          items: { $ref: '#/$defs/scoreBreakdownItem' },
        },
        fitScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description:
            'Overall company-tender fit score from 0 to 100, where higher means better fit.',
        },
        participationReadinessScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description:
            'Readiness to make a bid/no-bid decision and prepare submission. Higher means more ready.',
        },
        documentationCompletenessScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description:
            'Completeness of required tender/company evidence based on provided data. Higher means more complete.',
        },
        requirementsClarityScore: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description:
            'How clear and deterministic the tender requirements are. Higher means clearer requirements and fewer unresolved ambiguities.',
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
          description:
            'Commercial/strategic opportunity attractiveness. Higher means more attractive opportunity, regardless of current readiness.',
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
        summary: {
          type: 'string',
          description: 'Short localized final recommendation summary.',
        },
        rationale: {
          type: 'string',
          description:
            'Localized rationale explaining why this recommendation was chosen. Must be consistent with fitScore and requirement statuses.',
        },
        conditions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Localized conditions that must be satisfied before bidding or changing the recommendation.',
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
        rationale: {
          type: 'string',
          description:
            'Localized bid/no-bid rationale. Must be consistent with finalRecommendation.',
        },
        conditionsForBid: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Localized conditions that would make bidding reasonable.',
        },
        reasonsToDecline: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Localized reasons to decline if they cannot be resolved.',
        },
        requiredBeforeDecision: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Localized items that must be checked before making the final bid/no-bid decision.',
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
        summary: {
          type: 'string',
          description:
            'Localized opportunity summary explaining why the tender may or may not be strategically attractive.',
        },
        whyThisCouldBeAttractive: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
          description:
            'Localized reasons why this tender could be attractive. Maximum 5 items.',
        },
        whyThisMayNotBeWorthIt: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
          description:
            'Localized reasons why this tender may not be worth pursuing. Maximum 5 items.',
        },
        likelyCompetitionLevel: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'unknown'],
          description:
            'Estimated competition level based only on provided tender context. Use unknown if not enough information.',
        },
      },
    },
  },

  $defs: {
    evidenceReference: {
      type: 'object',
      additionalProperties: false,
      required: ['sourceType'],
      properties: {
        sourceType: {
          type: 'string',
          enum: [
            'structured_ted',
            'ted_xml',
            'ted_pdf',
            'tender_document',
            'general_analysis',
            'company_profile',
            'company_document',
            'derived_metadata',
          ],
          description:
            'Source where the requirement, risk, or question was found. Enum value must remain untranslated.',
        },
        documentName: {
          type: 'string',
          description:
            'Optional source document name, file name, or source label. Omit if unknown.',
        },
        section: {
          type: 'string',
          description:
            'Optional human-readable source location or topic, such as “Selection criteria”, “Submission deadline”, “Company languages”, “Reference projects”, “Section 5.1.12”, “Page 3”, or “Clause 4.2”. Do not use JSON paths, object keys, array indexes, database fields, or internal field names. Omit if unknown.',
        },
        url: {
          type: 'string',
          description:
            'Optional URL to the source document or tender page if available in the input. Omit if unknown.',
        },
      },
    },

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
          description: 'Severity of the risk impact if it occurs.',
        },
        probability: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'unknown'],
          description:
            'Estimated likelihood of the risk based only on provided information.',
        },
        description: {
          type: 'string',
          description: 'Localized risk description.',
        },
        businessImpact: {
          type: 'string',
          description:
            'Localized explanation of the practical business impact.',
        },
        mitigation: {
          type: 'string',
          description:
            'Optional localized mitigation action. Omit if no useful mitigation is available.',
        },
        evidenceReferences: {
          type: 'array',
          items: { $ref: '#/$defs/evidenceReference' },
          description:
            'Optional references showing where this risk was identified. Use only sources provided in the input. Omit if no reliable source reference is available.',
        },
        evidenceQuote: {
          type: 'string',
          description:
            'Optional short quote or paraphrased excerpt supporting this risk. Omit if no reliable quote is available.',
        },
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
        name: {
          type: 'string',
          description: 'Localized document or evidence name.',
        },
        documentCategory: {
          type: 'string',
          description:
            'Short localized category name for grouping related missing documents in the UI.',
        },
        importance: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
          description:
            'Importance of this document or evidence for qualification or submission.',
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
          description:
            'Current status based on provided data. MISSING means missing from provided/analyzed data, not proof that the company does not have it.',
        },
        description: {
          type: 'string',
          description: 'Localized description of the document or evidence.',
        },
        whyNeeded: {
          type: 'string',
          description:
            'Localized explanation of why this document or evidence is needed.',
        },
        impactIfMissing: {
          type: 'string',
          description:
            'Localized consequence if this document or evidence cannot be provided.',
        },
        portalUrl: {
          type: ['string', 'null'],
          description:
            'Portal URL where this document may be available, if known. Use null only if schema allows and URL is unknown.',
        },
        directDownloadUrl: {
          type: ['string', 'null'],
          description:
            'Direct download URL, if known. Use null only if schema allows and URL is unknown.',
        },
        possibleUrls: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Possible URLs related to this document. Empty array if none are known.',
        },
        recommendedAction: {
          type: 'string',
          description:
            'Localized recommended action to obtain, verify, or prepare this document.',
        },
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
          description: 'Priority of the clarification question.',
        },
        question: {
          type: 'string',
          description:
            'Localized question to ask the buyer or resolve internally.',
        },
        reason: {
          type: 'string',
          description: 'Localized reason why this question matters.',
        },
        questionCategory: {
          type: 'string',
          description:
            'Short localized category for grouping clarification questions in the UI.',
        },
        companyImpact: {
          type: 'string',
          description:
            'Optional localized explanation of how the answer affects the company decision or bid preparation.',
        },
        evidenceReferences: {
          type: 'array',
          items: { $ref: '#/$defs/evidenceReference' },
          description:
            'Optional references showing what source triggered this clarification question. Omit if no reliable source reference is available.',
        },
        evidenceQuote: {
          type: 'string',
          description:
            'Optional short quote or excerpt explaining why this clarification is needed. Omit if no reliable quote is available.',
        },
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
          description: 'Priority of this action.',
        },
        action: {
          type: 'string',
          description: 'Localized concrete action to perform.',
        },
        reason: {
          type: 'string',
          description: 'Localized reason why this action is needed.',
        },
        ownerRole: {
          type: 'string',
          description:
            'Short localized role or team responsible for this step, suitable for UI display.',
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
          description:
            'When this action should be completed. Enum must remain untranslated.',
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
            "Short localized score category name, such as 'Scope Fit', 'Technical Fit', 'Experience', 'Financial Capacity', 'Language', 'Commercial Fit', 'Risk', or another relevant evaluation area.",
        },
        score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description:
            'Criterion score from 0 to 100. For fit/readiness/opportunity criteria, higher means better. For risk criteria, higher means higher risk and worse situation.',
        },
        explanation: {
          type: 'string',
          description: 'Localized explanation of why this score was assigned.',
        },
      },
    },
  },
} as const;
