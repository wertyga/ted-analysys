import {
  mergeSearchPage,
  readPath,
  resolveSearchSources,
} from './ted.search.sources';

const row = (id: string, national: boolean, value: unknown) => ({
  id,
  national,
  value,
});

describe('resolveSearchSources', () => {
  it('searches everything when the filter is empty', () => {
    expect(resolveSearchSources()).toEqual({
      includeTed: true,
      nationalSources: ['PL_BZP'],
    });
  });

  it('narrows to the selected sources', () => {
    expect(resolveSearchSources(['TED'])).toEqual({
      includeTed: true,
      nationalSources: [],
    });
    expect(resolveSearchSources(['PL_BZP'])).toEqual({
      includeTed: false,
      nationalSources: ['PL_BZP'],
    });
  });
});

describe('mergeSearchPage', () => {
  const ted = [
    row('t1', false, new Date('2026-11-17')),
    row('t2', false, new Date('2026-11-15')),
    row('t3', false, new Date('2026-11-10')),
  ];
  const national = [
    row('p1', true, new Date('2026-11-16')),
    row('p2', true, new Date('2026-11-12')),
  ];

  it('merges descending and pages', () => {
    expect(mergeSearchPage(ted, national, -1, 0, 3).map((r) => r.id)).toEqual([
      't1',
      'p1',
      't2',
    ]);
    expect(mergeSearchPage(ted, national, -1, 3, 3).map((r) => r.id)).toEqual([
      'p2',
      't3',
    ]);
  });

  it('merges ascending', () => {
    expect(
      mergeSearchPage([...ted].reverse(), [...national].reverse(), 1, 0, 5).map(
        (r) => r.id,
      ),
    ).toEqual(['t3', 'p2', 't2', 'p1', 't1']);
  });

  it('puts missing values last when descending, like Mongo', () => {
    expect(
      mergeSearchPage(
        [row('t1', false, 5), row('t2', false, null)],
        [row('p1', true, 3)],
        -1,
        0,
        3,
      ).map((r) => r.id),
    ).toEqual(['t1', 'p1', 't2']);
  });

  it('reads dotted paths', () => {
    expect(
      readPath({ estimatedValue: { amount: 7 } }, 'estimatedValue.amount'),
    ).toBe(7);
    expect(readPath({}, 'estimatedValue.amount')).toBeUndefined();
  });
});
