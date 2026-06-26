export const CRON_CONFIG = {
  timeZone: 'Europe/Warsaw',
  tenders: {
    recentTenders: '0 1 * * *',
    allCompetitionTenders: '0 3 * * 0',
    recentAwardTenders: '0 4 * * *',
  },
  databaseCopy: {
    toCdn: '0 7 * * *',
  },
  tenderMatchNotifications: {
    daily: '0 8 * * *',
    weekly: '0 8 * * 1',
  },
  currencyExchangeRates: {
    syncLatestRates: '30 16 * * *',
  },
  tech: {
    estimatedValueEurUpdateBatchSize: 500,
    initialRunDelayMs: 2000,
  },
};
