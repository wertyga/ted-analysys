export const CURRENCY_EXCHANGE_RATES_CONFIG = {
  ecbDailyRatesUrl:
    'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
  cron: '30 16 * * *',
  requestTimeoutMs: 30_000,
  timeZone: 'Europe/Warsaw',
};
