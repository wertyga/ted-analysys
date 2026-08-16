export const isDev = process.env.NODE_ENV !== 'production';

// PM2 cluster mode spins up one process per instance and sets NODE_APP_INSTANCE
// per worker; without this guard every @Cron handler would fire once per worker.
export const isCronLeaderInstance = () =>
  (process.env.NODE_APP_INSTANCE ?? '0') === '0';
