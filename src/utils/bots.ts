const SEARCH_BOT_UA_REGEX =
  /googlebot|bingbot|yandexbot|duckduckbot|baiduspider|slurp|facebookexternalhit|twitterbot|linkedinbot|telegrambot|applebot|semrushbot|ahrefsbot|mj12bot/i;

export function isSearchBot(userAgent?: string): boolean {
  if (!userAgent) return false;
  return SEARCH_BOT_UA_REGEX.test(userAgent);
}
