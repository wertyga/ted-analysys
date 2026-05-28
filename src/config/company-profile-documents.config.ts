export const COMPANY_PROFILE_DOCUMENTS_CONFIG = {
  upload: {
    maxDocuments: 10,
  },
  context: {
    maxChars: 80_000,
    maxSingleDocumentChars: 40_000,
    maxEvidenceItems: 10,
  },
  analysis: {
    concurrency: 20,
    waitTimeoutMs: 10 * 60 * 1000,
    waitIntervalMs: 1000,
  },
};
