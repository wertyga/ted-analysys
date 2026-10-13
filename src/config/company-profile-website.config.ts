export const COMPANY_PROFILE_WEBSITE_CONFIG = {
  crawl: {
    /** Pages fetched besides the start page. */
    maxExtraPages: 8,
    concurrency: 4,
    requestTimeoutMs: 10_000,
    maxRedirects: 5,
    maxResponseBytes: 3 * 1024 * 1024,
    userAgent:
      'Mozilla/5.0 (compatible; TenderwizeBot/1.0; +https://tenderwize.com)',
  },
  context: {
    maxCharsPerPage: 12_000,
    maxChars: 60_000,
    maxJsonLdChars: 3_000,
    /** Less readable text than this means a client-rendered or empty site. */
    minTotalChars: 300,
  },
  analysis: {
    concurrency: 10,
    /** A run still PROCESSING after this long is treated as crashed. */
    staleRunMs: 15 * 60 * 1000,
  },
};
