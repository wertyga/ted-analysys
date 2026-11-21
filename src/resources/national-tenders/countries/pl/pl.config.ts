export const PL_BZP_CONFIG = {
  /** Public BZP read API. No auth; documented at ezamowienia.gov.pl/pl/integracja. */
  noticesUrl: 'https://ezamowienia.gov.pl/mo-board/api/v1/notice',
  /** Procedure page on the e-Zamówienia platform, suffixed with the OCDS procedure id. */
  procedureUrlBase: 'https://ezamowienia.gov.pl/mp-client/search/list/',
  /** BZP adds this to `PublicationDateTo`; the client subtracts it. */
  publicationDateToShiftMs: 24 * 60 * 60 * 1000,
  /** API maximum. */
  pageSize: 500,
  /** Guaranteed limit is 30 req/min per IP (HTTP 403 above it); stay below. */
  minRequestIntervalMs: 2_500,
  /** Wait after a 403 before retrying. */
  rateLimitBackoffMs: 65_000,
  maxRetries: 3,
  requestTimeoutMs: 60_000,
  /** Recent run re-reads this window back from the last publication seen. */
  recentOverlapMs: 60 * 60 * 1000,
  /** First recent run (no state yet) starts this far back. */
  recentDefaultLookbackMs: 2 * 24 * 60 * 60 * 1000,
  /** Result notices are never re-read further back than this. */
  resultsMaxLookbackMs: 3 * 24 * 60 * 60 * 1000,
  /** Update notices are never re-read further back than this. */
  updatesMaxLookbackMs: 3 * 24 * 60 * 60 * 1000,
  /** Backfill reads notices published this many days back; open ones are kept. */
  backfillDays: 90,
  generateShortTitles: false,
};
