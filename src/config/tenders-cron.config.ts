export const TENDERS_CRON_CONFIG = {
  cron: {
    recentTenders: '0 1 * * *',
    allCompetitionTenders: '0 3 * * *',
  },
  tech: {
    estimatedValueEurUpdateBatchSize: 500,
    initialRunDelayMs: 2000,
  },
  timeZone: 'Europe/Warsaw',
};
