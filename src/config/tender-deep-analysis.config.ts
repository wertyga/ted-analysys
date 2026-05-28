import { CompanyFitScoreKey } from '@/types';

export const TENDER_DEEP_ANALYSIS_CONFIG = {
  companyFitAnalysis: {
    concurrency: 5,
    maxJsonChars: 60_000,
    maxSnippetsJsonChars: 40_000,
  },
  scoring: {
    companyFitWeights: {
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
    } satisfies Record<CompanyFitScoreKey, number>,
  },
};
