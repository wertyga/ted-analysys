export const GENERAL_TENDER_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'lots',
    'scopeOfWork',
    'keyRequirements',
    'eligibilityCriteria',
    'requiredDocuments',
    'awardCriteria',
    'deadlines',
    'estimatedValue',
    'advantages',
    'disadvantages',
    'risks',
    'hiddenPitfalls',
    'questionsToAsk',
    'complexityScore',
    'opportunityScore',
    'generalRecommendation',
    'confidenceScore',
    'analysisDepth',
    'documentsAnalyzedCount',
    'missingDocumentsWarning',
  ],
  properties: {
    summary: { type: 'string' },

    lots: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'identifier',
          'title',
          'summary',
          'cpvCodes',
          'estimatedValue',
          'deadline',
          'source',
        ],
        properties: {
          identifier: { type: ['string', 'null'] },
          title: { type: ['string', 'null'] },
          summary: { type: 'string' },
          cpvCodes: {
            type: 'array',
            items: { type: 'string' },
          },
          estimatedValue: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['amount', 'currency', 'description'],
            properties: {
              amount: { type: ['number', 'null'] },
              currency: { type: ['string', 'null'] },
              description: { type: ['string', 'null'] },
            },
          },
          deadline: { type: ['string', 'null'] },
          source: {
            type: 'string',
            enum: ['STRUCTURED_DATA', 'XML_NOTICE', 'DOCUMENT_TEXT'],
          },
        },
      },
    },

    scopeOfWork: {
      type: 'array',
      items: { type: 'string' },
    },

    keyRequirements: {
      type: 'array',
      items: { type: 'string' },
    },

    eligibilityCriteria: {
      type: 'array',
      items: { type: 'string' },
    },

    requiredDocuments: {
      type: 'array',
      items: { type: 'string' },
    },

    awardCriteria: {
      type: 'array',
      items: { type: 'string' },
    },

    deadlines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'date', 'description'],
        properties: {
          name: { type: 'string' },
          date: { type: ['string', 'null'] },
          description: { type: 'string' },
        },
      },
    },

    estimatedValue: {
      type: 'object',
      additionalProperties: false,
      required: ['amount', 'currency', 'description', 'source'],
      properties: {
        amount: {
          type: ['number', 'null'],
        },
        currency: {
          type: ['string', 'null'],
        },
        description: {
          type: ['string', 'null'],
        },
        source: {
          type: 'string',
          enum: ['STRUCTURED_DATA', 'XML_NOTICE', 'DOCUMENT_TEXT', 'NOT_FOUND'],
        },
      },
    },

    advantages: {
      type: 'array',
      items: { type: 'string' },
    },

    disadvantages: {
      type: 'array',
      items: { type: 'string' },
    },

    risks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'severity', 'description', 'mitigation'],
        properties: {
          type: { type: 'string' },
          severity: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH'],
          },
          description: { type: 'string' },
          mitigation: { type: ['string', 'null'] },
        },
      },
    },

    hiddenPitfalls: {
      type: 'array',
      items: { type: 'string' },
    },

    questionsToAsk: {
      type: 'array',
      items: { type: 'string' },
    },

    complexityScore: {
      type: 'number',
      minimum: 0,
      maximum: 100,
    },

    opportunityScore: {
      type: 'number',
      minimum: 0,
      maximum: 100,
    },

    generalRecommendation: {
      type: 'string',
      enum: ['PROMISING', 'NEEDS_REVIEW', 'NOT_RECOMMENDED'],
    },

    confidenceScore: {
      type: 'number',
      minimum: 0,
      maximum: 100,
    },

    analysisDepth: {
      type: 'string',
      enum: [
        'STRUCTURED_NOTICE_ONLY',
        'NOTICE_WITH_DOCUMENTS',
        'FULL_DOCUMENTS',
      ],
    },

    documentsAnalyzedCount: {
      type: 'integer',
      minimum: 0,
    },

    missingDocumentsWarning: {
      type: 'boolean',
    },
  },
} as const;
