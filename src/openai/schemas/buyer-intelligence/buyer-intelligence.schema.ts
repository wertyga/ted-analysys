export const BUYER_INTELLIGENCE_LLM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'buyingPatterns',
    'supplierPatterns',
    'contractPatterns',
    'dataLimitations',
    'neutralObservations',
  ],
  properties: {
    summary: {
      type: 'string',
      description:
        'Short localized neutral summary of the buyer as a public procurement entity. Must describe what is known from the provided buyer profile, statistics, signals, recent tenders, and award history. Do not evaluate any specific bidder or company fit.',
    },

    buyingPatterns: {
      type: 'array',
      maxItems: 6,
      description:
        'Neutral localized observations about what this buyer usually purchases and how its procurement activity appears over time. Use only provided data. Do not give company-specific advice.',
      items: { type: 'string' },
    },

    supplierPatterns: {
      type: 'array',
      maxItems: 6,
      description:
        'Neutral localized observations about historical supplier selection patterns based on award tenders and top suppliers. Supplier repetition and domestic winners are historical signals only, not proof of favoritism, discrimination, corruption, or unlawful behaviour.',
      items: { type: 'string' },
    },

    contractPatterns: {
      type: 'array',
      maxItems: 6,
      description:
        'Neutral localized observations about typical contract characteristics: value ranges, contract nature, procedure types, CPV areas, or place-of-performance patterns. Do not invent missing values.',
      items: { type: 'string' },
    },

    dataLimitations: {
      type: 'array',
      maxItems: 6,
      description:
        'Localized limitations of the available buyer intelligence. Mention missing or weak evidence, limited award history, missing supplier countries, missing values, or low confidence when relevant.',
      items: { type: 'string' },
    },

    neutralObservations: {
      type: 'array',
      maxItems: 6,
      description:
        'Additional neutral localized observations useful for understanding the buyer. Do not include bidder-specific recommendations, win probability, or company fit assessment.',
      items: { type: 'string' },
    },
  },
} as const;
