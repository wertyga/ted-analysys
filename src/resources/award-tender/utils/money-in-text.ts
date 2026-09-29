/**
 * Finds money amounts in free text written in any European format:
 * "3.199.999,06", "3 199 999,06", "3,199,999.06", "3199999.063",
 * "3,4 milhões de euros", "2,3 Mio. EUR".
 */

// Space, dot, comma, apostrophe, no-break space, narrow no-break space
const SEPARATOR_CHARS = ` .,'${String.fromCharCode(0xa0, 0x202f)}`;

// Groups of 3 digits split by a separator, or a plain number
const NUMBER_PATTERN = new RegExp(
  `\\d{1,3}(?:[${SEPARATOR_CHARS}]\\d{3})+(?:[.,]\\d{1,3})?|\\d+(?:[.,]\\d{1,3})?`,
  'g',
);

const SEPARATORS = new RegExp(`[${SEPARATOR_CHARS}]`);

// Checked right after the number: "3,4 milhões", "2.5 Mio.", "12 M€"
const MULTIPLIERS: { pattern: RegExp; factor: number }[] = [
  {
    pattern:
      /^\s*(billions?|milliards?|miliardi|miliardo|mil millones|mld\.?|bn)\b/i,
    factor: 1e9,
  },
  {
    pattern:
      /^\s*(millions?|milhões|milhão|milioni|milione|millones|millón|mio\.?|mill\.?|mln\.?|miljoner|miljon|miljoen|milionów|miliony|milion|milionů|milióna|millió|m€|meur)(?=[\s.,;:)€]|$)/i,
    factor: 1e6,
  },
  { pattern: /^\s*(tys\.?|tis\.?|k€|keur)(?=[\s.,;:)€]|$)/i, factor: 1e3 },
];

const MULTIPLIER_LOOKAHEAD = 20;

const AMOUNT_TOLERANCE = 1;

/**
 * All values a number token may mean: "1.234" is 1234 in Portugal and
 * 1.234 in the UK, so both are returned.
 */
export function parseNumberToken(token: string): number[] {
  const values = new Set<number>();
  const digitsOnly = token.replace(/[^\d]/g, '');

  if (digitsOnly) {
    values.add(Number(digitsOnly));
  }

  const lastSeparator = Math.max(
    token.lastIndexOf('.'),
    token.lastIndexOf(','),
  );

  if (lastSeparator > 0) {
    const decimals = token.slice(lastSeparator + 1);
    const integer = token.slice(0, lastSeparator).replace(/[^\d]/g, '');

    if (decimals.length <= 3 && !SEPARATORS.test(decimals) && integer) {
      values.add(Number(`${integer}.${decimals}`));
    }
  }

  return [...values].filter((value) => Number.isFinite(value));
}

/**
 * Values of every number in the text, with "milhões"-like words applied.
 */
function findNumbers(
  text: string,
): { index: number; length: number; values: number[] }[] {
  return [...text.matchAll(NUMBER_PATTERN)].map((match) => {
    const index = match.index ?? 0;
    const after = text.slice(
      index + match[0].length,
      index + match[0].length + MULTIPLIER_LOOKAHEAD,
    );
    const multiplier = MULTIPLIERS.find(({ pattern }) => pattern.test(after));
    const values = parseNumberToken(match[0]);

    return {
      index,
      length: match[0].length,
      values: multiplier
        ? [
            ...values,
            ...values.map((value) => Math.round(value * multiplier.factor)),
          ]
        : values,
    };
  });
}

export function textContainsAmount(text: string, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  return findNumbers(text).some(({ values }) =>
    values.some((value) => Math.abs(value - amount) <= AMOUNT_TOLERANCE),
  );
}

/**
 * Cuts the parts of a long page that mention big numbers, so the model reads
 * a few KB instead of the whole page.
 */
export function extractMoneySnippets(
  text: string,
  options: { minAmount?: number; radius?: number; maxChars?: number } = {},
): string {
  const minAmount = options.minAmount ?? 10_000;
  const radius = options.radius ?? 250;
  const maxChars = options.maxChars ?? 5000;
  const ranges: [number, number][] = [];

  for (const number of findNumbers(text)) {
    if (!number.values.some((value) => value >= minAmount)) {
      continue;
    }

    const start = Math.max(0, number.index - radius);
    const end = Math.min(text.length, number.index + number.length + radius);
    const last = ranges[ranges.length - 1];

    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  let result = '';

  for (const [start, end] of ranges) {
    const snippet = text.slice(start, end);

    if (result.length + snippet.length > maxChars) {
      break;
    }

    result += (result ? ' … ' : '') + snippet;
  }

  return result;
}
