export function normalizeCpvCodes(codes: string[]): string[] {
  return Array.from(
    new Set(
      codes.map((code) => code.trim()).filter((code) => /^\d{8}$/.test(code)),
    ),
  );
}

export type CpvMatchMode = 'TREE' | 'EXACT';

export function buildAdaptiveCpvQuery(
  cpvCodes: string[] | undefined,
): string | undefined {
  const codes = normalizeCpvCodes(cpvCodes ?? []);

  if (codes.length === 0) {
    return undefined;
  }

  const parts = codes.map((code) => {
    const matchMode = resolveCpvMatchMode(code);

    return matchMode === 'TREE' ? toCpvTreePattern(code) : code;
  });

  return `classification-cpv IN (${parts.join(' ')})`;
}

export function resolveCpvMatchMode(code: string): CpvMatchMode {
  const level = getCpvLevel(code);

  return level >= 3 && level <= 4 ? 'TREE' : 'EXACT';
}

export function getCpvLevel(code: string): number {
  const normalized = code.trim();
  const significantLength = normalized.replace(/0+$/, '').length;

  return Math.min(Math.max(significantLength, 2), 8);
}

function toCpvTreePattern(code: string): string {
  const prefix = code.replace(/0+$/, '');

  if (prefix.length >= 2 && prefix.length < 8) {
    return `${prefix}*`;
  }

  return code;
}
