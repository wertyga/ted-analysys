import { NationalTenderSource } from '@/resources/national-tenders/core/national-tender.types';

/** `sources` filter values: TED plus every national source. */
export const TED_SOURCE = 'TED';
export const TENDER_SOURCE_FILTER_VALUES = [
  TED_SOURCE,
  ...Object.values(NationalTenderSource),
] as const;
export type TenderSourceFilter = (typeof TENDER_SOURCE_FILTER_VALUES)[number];

/** Collections to search for a `sources` filter (empty = all sources). */
export function resolveSearchSources(sources?: string[]) {
  const national = Object.values(NationalTenderSource);

  if (!sources?.length) {
    return { includeTed: true, nationalSources: national };
  }

  return {
    includeTed: sources.includes(TED_SOURCE),
    nationalSources: national.filter((source) => sources.includes(source)),
  };
}

export interface SearchPageRow {
  id: string;
  national: boolean;
  value: unknown;
}

const toSortable = (value: unknown): number => {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value) {
    const time = Date.parse(value);

    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
  }

  // Mongo orders null/missing below any value.
  return Number.NEGATIVE_INFINITY;
};

/** Reads a dotted path ("estimatedValue.amount") from a lean record. */
export const readPath = (record: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined,
      record,
    );

/**
 * Merges two lists already sorted by the same field (each holding the first
 * `skip + limit` rows of its collection) and returns the requested page.
 */
export function mergeSearchPage(
  ted: SearchPageRow[],
  national: SearchPageRow[],
  direction: 1 | -1,
  skip: number,
  limit: number,
): SearchPageRow[] {
  const merged: SearchPageRow[] = [];
  let i = 0;
  let j = 0;

  while (
    merged.length < skip + limit &&
    (i < ted.length || j < national.length)
  ) {
    if (j >= national.length) {
      merged.push(ted[i++]);
      continue;
    }
    if (i >= ted.length) {
      merged.push(national[j++]);
      continue;
    }

    const raw = toSortable(ted[i].value) - toSortable(national[j].value);
    const diff = Number.isNaN(raw) ? 0 : raw;
    const tedFirst = direction === 1 ? diff <= 0 : diff >= 0;

    merged.push(tedFirst ? ted[i++] : national[j++]);
  }

  return merged.slice(skip, skip + limit);
}
