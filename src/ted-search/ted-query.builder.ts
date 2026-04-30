function sanitizeToken(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]/g, '');
}

function normalizeTokens(values: string[]): string[] {
  return values.map(sanitizeToken).filter(Boolean);
}

export function buildCpvQuery(
  cpvCodes: string[],
  matchMode: 'TREE' | 'EXACT' = 'TREE',
): string {
  const codes = this.normalizeCpvCodes(cpvCodes);
  
  if (matchMode === 'EXACT') {
    return `classification-cpv IN (${codes.join(' ')})`;
  }
  
  const parts = codes.map((code) => {
    const prefix = code.replace(/0+$/, '');
    
    if (prefix.length >= 2 && prefix.length < 8) {
      return `${prefix}*`;
    }
    
    return code;
  });
  
  return `classification-cpv IN (${parts.join(' ')})`;
}

export function buildCountryQuery(countries: string[]): string {
  const normalizedCountries = normalizeTokens(countries).map((country) =>
    country.toUpperCase(),
  );

  if (normalizedCountries.length === 0) {
    throw new Error('At least one country code is required');
  }

  // TODO: Verify the exact expert-search field name in TED Swagger/Expert Search
  // before using this in production request builders.
  return `(place-of-performance IN (${normalizedCountries.join(' ')}))`;
}

export function combineAnd(queries: string[]): string {
  const normalizedQueries = queries
    .map((query) => query.trim())
    .filter(Boolean);

  if (normalizedQueries.length === 0) {
    throw new Error('At least one query is required');
  }

  if (normalizedQueries.length === 1) {
    return normalizedQueries[0];
  }

  return `(${normalizedQueries.join(' AND ')})`;
}
