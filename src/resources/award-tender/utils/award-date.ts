/**
 * Award date shown, filtered and sorted in the awards list.
 *
 * TED "winner-decision-date" has one entry per lot and is full of garbage:
 * 1970-01-01, dates decades before the notice, dates after it. We keep the
 * latest date that fits the window around the publication date, or null.
 */

// Decisions published later than that are almost always typos
export const MAX_AWARD_DATE_AGE_YEARS = 5;

// Decision cannot be made after the notice is published; slack for timezones
const MAX_AWARD_DATE_AHEAD_MS = 2 * 24 * 60 * 60 * 1000;

const MIN_AWARD_DATE = new Date('2000-01-01T00:00:00.000Z');

export function getAwardDateWindow(publicationDate?: Date | string | null): {
  min: Date;
  max: Date;
} {
  const published = publicationDate ? new Date(publicationDate) : null;
  const base =
    published && !Number.isNaN(published.getTime()) ? published : new Date();

  const min = new Date(base);
  min.setUTCFullYear(min.getUTCFullYear() - MAX_AWARD_DATE_AGE_YEARS);

  return {
    min: min > MIN_AWARD_DATE ? min : MIN_AWARD_DATE,
    max: new Date(base.getTime() + MAX_AWARD_DATE_AHEAD_MS),
  };
}

export function getAwardDate(
  awardDecisionDates: Array<Date | string | null | undefined> | undefined,
  publicationDate?: Date | string | null,
): Date | null {
  const { min, max } = getAwardDateWindow(publicationDate);

  const times = (awardDecisionDates ?? [])
    .map((date) => (date ? new Date(date).getTime() : NaN))
    .filter(
      (time) =>
        !Number.isNaN(time) && time >= min.getTime() && time <= max.getTime(),
    );

  return times.length ? new Date(Math.max(...times)) : null;
}

/**
 * Same rule as getAwardDate, as an aggregation expression for backfills
 */
export function getAwardDateExpression() {
  const base = { $ifNull: ['$publicationDate', '$$NOW'] };

  return {
    $max: {
      $filter: {
        input: { $ifNull: ['$awardDecisionDates', []] },
        as: 'date',
        cond: {
          $and: [
            { $eq: [{ $type: '$$date' }, 'date'] },
            { $gte: ['$$date', MIN_AWARD_DATE] },
            {
              $gte: [
                '$$date',
                {
                  $dateSubtract: {
                    startDate: base,
                    unit: 'year',
                    amount: MAX_AWARD_DATE_AGE_YEARS,
                  },
                },
              ],
            },
            {
              $lte: ['$$date', { $add: [base, MAX_AWARD_DATE_AHEAD_MS] }],
            },
          ],
        },
      },
    },
  };
}
