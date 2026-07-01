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
        'Maximum 2 sentences. Concise neutral buyer-level overview focused on procurement characteristics and interpretation. Do not repeat buyer metadata, statistics, dates, or values already shown in the UI.',
    },

    procurementProfile: {
      type: 'object',
      additionalProperties: false,
      required: ['overview', 'highlights'],
      properties: {
        overview: {
          type: 'string',
          description:
            'Maximum 2 sentences. Explain procurement focus and activity interpretation. Do not repeat legal type, country, or deterministic statistics.',
        },
        highlights: {
          type: 'array',
          minItems: 0,
          maxItems: 3,
          items: { type: 'string' },
          description:
            'Up to 3 concise observations about typical purchases, procurement focus, or activity level. Each item should add new information and avoid repeating the overview. Do not infer direct awards or non-competitive buying from missing competition tender notices.',
        },
      },
    },

    marketBehavior: {
      type: 'object',
      additionalProperties: false,
      required: ['overview', 'highlights'],
      properties: {
        overview: {
          type: 'string',
          description:
            'Maximum 2 sentences. Explain recurring procurement behaviour and purchasing patterns. Focus on meaning, not raw facts.',
        },
        highlights: {
          type: 'array',
          minItems: 0,
          maxItems: 3,
          items: { type: 'string' },
          description:
            'Up to 3 concise observations about contract patterns, procedure patterns, value patterns, or place-of-performance. Prefer recurring patterns over isolated examples.',
        },
      },
    },

    supplierLandscape: {
      type: 'object',
      additionalProperties: false,
      required: ['overview', 'highlights'],
      properties: {
        overview: {
          type: 'string',
          description:
            'Maximum 2 sentences. Explain supplier concentration, supplier diversity, and supplier composition. Do not imply unfairness, favoritism, or discrimination.',
        },
        highlights: {
          type: 'array',
          minItems: 0,
          maxItems: 3,
          items: { type: 'string' },
          description:
            'Up to 3 concise observations about repeat suppliers, domestic supplier patterns, and supplier diversity. Explain what backend signals mean without repeating percentages already shown in the UI.',
        },
      },
    },

    historicalTrends: {
      type: 'array',
      minItems: 0,
      maxItems: 3,
      items: { type: 'string' },
      description:
        'Only recurring long-term procurement trends supported by multiple tenders or awards. Return an empty array if history is too small or trends are not meaningful.',
    },

    dataLimitations: {
      type: 'array',
      minItems: 0,
      maxItems: 3,
      items: { type: 'string' },
      description:
        'Only limitations that materially reduce confidence. Avoid obvious limitations already visible from UI statistics. Do not mention disagreement between recent examples and backend signals.',
    },
  },
} as const;
