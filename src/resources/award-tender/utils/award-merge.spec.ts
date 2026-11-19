import { mergeAwardPages, toAwardSortValue } from './award-merge';

const rows = (national: boolean, values: (number | null)[]) =>
  values.map((value, i) => ({
    record: `${national ? 'n' : 't'}${i}`,
    national,
    value,
  }));

describe('mergeAwardPages', () => {
  it('merges descending with nulls last', () => {
    const page = mergeAwardPages(
      rows(false, [10, 5, null]),
      rows(true, [8, null]),
      -1,
      0,
      10,
    );

    expect(page.map((r) => r.record)).toEqual(['t0', 'n0', 't1', 't2', 'n1']);
  });

  it('merges ascending with nulls last', () => {
    const page = mergeAwardPages(
      rows(false, [1, 7, null]),
      rows(true, [3, null]),
      1,
      0,
      10,
    );

    expect(page.map((r) => r.record)).toEqual(['t0', 'n0', 't1', 't2', 'n1']);
  });

  it('returns the requested page', () => {
    const page = mergeAwardPages(
      rows(false, [10, 6, 2]),
      rows(true, [9, 5, 1]),
      -1,
      2,
      2,
    );

    expect(page.map((r) => r.record)).toEqual(['t1', 'n1']);
  });
});

describe('toAwardSortValue', () => {
  it('treats zero values as missing when positiveOnly', () => {
    expect(toAwardSortValue(0, true)).toBeNull();
    expect(toAwardSortValue(0)).toBe(0);
    expect(toAwardSortValue(null)).toBeNull();
    expect(toAwardSortValue(new Date(5))).toBe(5);
  });
});
