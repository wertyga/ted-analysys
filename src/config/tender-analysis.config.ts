export const TENDER_ANALYSIS_CONFIG = {
  wait: {
    timeoutMs: 10 * 60 * 1000,
    intervalMs: 1000,
  },
  baseAnalysis: {
    concurrency: 20,
  },
  freeBasicAnalysisFields: [
    'summary',
    {
      name: 'lots',
      len: 3,
    },
    {
      name: 'scopeOfWork',
      len: 2,
    },
    {
      name: 'keyRequirements',
      len: 3,
    },
    { name: 'risks', len: 2 },
    'deadlines',
    'estimatedValue',
    'complexityScore',
    'opportunityScore',
    'confidenceScore',
    'generalRecommendation',
    'analysisDepth',
    'documentsAnalyzedCount',
    'missingDocumentsWarning',
  ] as const,
};
