export function normalizeCpvCodes(codes: string[]): string[] {
  return Array.from(
    new Set(
      codes.map((code) => code.trim()).filter((code) => /^\d{8}$/.test(code)),
    ),
  );
}

export function buildCpvQuery(
  cpvCodes: string[],
  matchMode: 'TREE' | 'EXACT' = 'TREE',
): string {
  const codes = normalizeCpvCodes(cpvCodes);

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
