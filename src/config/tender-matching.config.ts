import { gfTime } from '@/goldfish';

export const TENDER_MATCHING_CONFIG = {
  activeCompetitionTendersMatchBatchSize: 100,
  companyProfileRematch: {
    debounceMs: gfTime.minute,
    concurrency: 5,
  },
  companyTenderAiFit: {
    concurrency: 5,
  },
  scoring: {
    maxScore: 100,
  },
};
