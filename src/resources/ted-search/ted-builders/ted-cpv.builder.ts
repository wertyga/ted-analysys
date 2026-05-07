export function normalizeCpvCodes(codes: string[]): string[] {
  return Array.from(
    new Set(
      codes.map((code) => code.trim()).filter((code) => /^\d{8}$/.test(code)),
    ),
  );
}

export function getNarrowerCodes(codes: string[]): string[] {
  return codes.filter(
    (code) =>
      !codes.some(
        (candidateChild) =>
          candidateChild !== code && isCpvDescendant(candidateChild, code),
      ),
  );
}

export function buildAdaptiveCpvQuery(
  cpvCodes: string[] | undefined,
): string | undefined {
  const codes = getNarrowerCodes(normalizeCpvCodes(cpvCodes ?? []));

  if (codes.length === 0) {
    return undefined;
  }

  return `classification-cpv IN (${codes.join(' ')})`;
}

export function getCpvLevel(code: string): number {
  const normalized = code.trim();
  const significantLength = normalized.replace(/0+$/, '').length;

  return Math.min(Math.max(significantLength, 2), 8);
}

function isCpvDescendant(childCode: string, parentCode: string): boolean {
  const childLevel = getCpvLevel(childCode);
  const parentLevel = getCpvLevel(parentCode);

  if (childLevel <= parentLevel) {
    return false;
  }

  return childCode.startsWith(getCpvPrefix(parentCode));
}

function getCpvPrefix(code: string): string {
  const prefix = code.replace(/0+$/, '');

  return prefix.length >= 2 ? prefix : code.slice(0, 2);
}
