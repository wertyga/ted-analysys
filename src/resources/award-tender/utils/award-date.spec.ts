import { getAwardDate } from './award-date';

describe('getAwardDate', () => {
  const publicationDate = '2026-02-10T00:00:00.000Z';

  it('returns the latest date within the window', () => {
    expect(
      getAwardDate(
        ['2026-01-05T00:00:00.000Z', '2026-01-20T00:00:00.000Z'],
        publicationDate,
      ),
    ).toEqual(new Date('2026-01-20T00:00:00.000Z'));
  });

  it('drops epoch, too old and future dates', () => {
    expect(
      getAwardDate(
        [
          '1970-01-01T00:00:00.000Z',
          '2000-06-04T22:00:00.000Z',
          '2026-07-26T00:00:00.000Z',
          '2026-01-15T00:00:00.000Z',
        ],
        publicationDate,
      ),
    ).toEqual(new Date('2026-01-15T00:00:00.000Z'));
  });

  it('returns null when nothing is plausible', () => {
    expect(
      getAwardDate(['1970-01-01T00:00:00.000Z', ''], publicationDate),
    ).toBeNull();
    expect(getAwardDate([], publicationDate)).toBeNull();
    expect(getAwardDate(undefined, publicationDate)).toBeNull();
  });
});
