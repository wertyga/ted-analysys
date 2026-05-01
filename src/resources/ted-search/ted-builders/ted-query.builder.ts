export function sanitizeToken(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]/g, '');
}

export function normalizeTokens(values: string[]): string[] {
  return values.map(sanitizeToken).filter(Boolean);
}
