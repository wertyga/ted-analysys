/** Formats a date as YYYY-MM-DD (UTC). */
export const formatDate = (date: Date) => date.toISOString().slice(0, 10);

export const shiftDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};
