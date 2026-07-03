export function countUniqueValuesPerTender<T>(
  tenders: T[],
  getValues: (tender: T) => Array<string | null | undefined> | undefined,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();

  for (const tender of tenders) {
    const values = Array.from(
      new Set(
        (getValues(tender) ?? [])
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );

    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
