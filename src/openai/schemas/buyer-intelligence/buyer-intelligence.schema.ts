export const BUYER_INTELLIGENCE_LLM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'procurementProfile',
    'marketBehavior',
    'supplierLandscape',
    'historicalTrends',
    'dataLimitations',
  ],
  properties: {
    summary: {
      type: 'string',
      description:
        'Short localized neutral summary describing the buyer as a procurement entity. Focus on the main procurement characteristics rather than repeating statistics.',
    },

    procurementProfile: {
      type: 'object',
      additionalProperties: false,
      required: ['overview', 'typicalPurchases', 'activityAssessment'],
      properties: {
        overview: {
          type: 'string',
          description:
            'Neutral explanation of what kind of procurement organization this buyer appears to be based only on the provided data.',
        },

        typicalPurchases: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'string',
          },
          description:
            'Recurring or preliminary procurement areas inferred from CPV labels, tender titles, and procurement history. Prefer procurement categories instead of raw CPV codes.',
        },

        activityAssessment: {
          type: 'string',
          description:
            'Explain what the provided activityLevel indicates about procurement frequency and procurement recency.',
        },
      },
    },

    marketBehavior: {
      type: 'object',
      additionalProperties: false,
      required: ['contractPatterns', 'procedurePatterns', 'valuePatterns'],
      properties: {
        contractPatterns: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'string',
          },
          description:
            'Recurring or preliminary observations about contract types, contract nature, procurement scope, or place-of-performance.',
        },

        procedurePatterns: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'string',
          },
          description:
            'Recurring or preliminary observations about procurement procedures or buying approach. Use cautious wording when evidence is limited.',
        },

        valuePatterns: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'string',
          },
          description:
            'Observations about estimated and awarded value patterns. Explain significance rather than repeating raw monetary values.',
        },
      },
    },

    supplierLandscape: {
      type: 'object',
      additionalProperties: false,
      required: [
        'overview',
        'repeatSupplierPattern',
        'localSupplierPattern',
        'supplierDiversity',
      ],
      properties: {
        overview: {
          type: 'string',
          description:
            'Neutral overview of the historical supplier landscape based on available award history.',
        },

        repeatSupplierPattern: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'string',
          },
          description:
            'Explain historical repeat supplier behaviour using the provided incumbentRisk and repeatSupplierRate. Do not imply favoritism or unfairness.',
        },

        localSupplierPattern: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'string',
          },
          description:
            'Explain historical domestic supplier behaviour using localSupplierSignal and localSupplierRate. Do not imply discrimination or unlawful preference.',
        },

        supplierDiversity: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'string',
          },
          description:
            'Describe whether the historical supplier base appears concentrated or diverse based only on available award history.',
        },
      },
    },

    historicalTrends: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: {
        type: 'string',
      },
      description:
        'Higher-level historical procurement trends supported by multiple tenders or awards. Prefer recurring patterns over isolated examples.',
    },

    dataLimitations: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: {
        type: 'string',
      },
      description:
        'Limitations affecting confidence, such as small datasets, missing values, anonymized suppliers, incomplete award history, inconsistent dates, or missing procurement information.',
    },
  },
} as const;
