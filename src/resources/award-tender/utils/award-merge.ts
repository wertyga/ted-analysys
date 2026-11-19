/**
 * Merging of TED (`award_tenders`) and national (`national_award_tenders`)
 * award pages. Each source returns its first `skip + limit` records already
 * sorted the same way; records without the sort value go last in both
 * directions (same rule as `AwardTenderService.findSortedAwards`).
 */
export interface AwardMergeRow<T = unknown> {
  record: T;
  national: boolean;
  /** Sort value; null = no value (goes last). */
  value: number | null;
}

export function toAwardSortValue(value: unknown, positiveOnly = false) {
  const number =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'string' && value
        ? Date.parse(value)
        : typeof value === 'number'
          ? value
          : NaN;

  if (!Number.isFinite(number)) {
    return null;
  }

  return positiveOnly && number <= 0 ? null : number;
}

export function mergeAwardPages<T>(
  ted: AwardMergeRow<T>[],
  national: AwardMergeRow<T>[],
  direction: 1 | -1,
  skip: number,
  limit: number,
): AwardMergeRow<T>[] {
  const merged: AwardMergeRow<T>[] = [];
  let i = 0;
  let j = 0;

  const tedFirst = (a: AwardMergeRow<T>, b: AwardMergeRow<T>) => {
    if (a.value === null) return b.value === null;
    if (b.value === null) return true;

    return direction === 1 ? a.value <= b.value : a.value >= b.value;
  };

  while (merged.length < skip + limit && (i < ted.length || j < national.length)) {
    if (j >= national.length) {
      merged.push(ted[i++]);
    } else if (i >= ted.length) {
      merged.push(national[j++]);
    } else {
      merged.push(tedFirst(ted[i], national[j]) ? ted[i++] : national[j++]);
    }
  }

  return merged.slice(skip, skip + limit);
}
