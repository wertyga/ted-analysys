import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import { readNumber, readDate } from './checking';

function booleanFromValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = String(value)?.trim().toLowerCase();

  if (text === undefined || text.length === 0) {
    return undefined;
  }

  if (['true', '1', 'yes', 'y'].includes(text)) {
    return true;
  }

  if (['false', '0', 'no', 'n', 'none', 'not-allowed'].includes(text)) {
    return false;
  }

  return undefined;
}

function systemCodeFlagFromValue(value: unknown): boolean | undefined {
  const parsedBoolean = booleanFromValue(value);

  if (parsedBoolean !== undefined) {
    return parsedBoolean;
  }

  if (value === undefined || value === null) {
    return undefined;
  }

  const text = String(value)?.trim().toLowerCase();

  if (text === undefined || text.length === 0) {
    return undefined;
  }

  return text !== 'none';
}

export const getArrayValue = (field: string, notice: TedNotice) => {
  return Array.isArray(notice[field]) ? notice[field] : [notice[field]];
};

export const getStringArrayValue = (field: string, notice: TedNotice) => {
  return getArrayValue(field, notice)
    .filter((f) => !!f && typeof f === 'string')
    .map((f: string) => f.trim());
};

export const getBooleanArrayValue = (field: string, notice: TedNotice) => {
  return getArrayValue(field, notice)
    .map(systemCodeFlagFromValue)
    .filter((value): value is boolean => value !== undefined);
};

export const getStringValue = (field: string, notice: TedNotice) => {
  return String(getArrayValue(field, notice)?.[0] ?? '')?.trim() ?? '';
};

export const getEngValueOrFirst = (field: string, notice: TedNotice) => {
  if (!notice[field]) {
    return null;
  }

  if (Array.isArray(notice[field]) || typeof notice[field] === 'string') {
    return getStringValue(field, notice);
  }

  for (const key in notice[field]) {
    if (key.toLowerCase() === 'en' || key.toLowerCase() === 'eng') {
      return notice[field][key];
    }
  }

  return Object.values(notice[field])[0];
};

export const getDateValue = (field: string, notice: TedNotice) => {
  return parseTenderDate(getStringValue(field, notice));
};

export const getDateArrayValue = (field: string, notice: TedNotice) => {
  return getStringArrayValue(field, notice).map((d) => parseTenderDate(d));
};

export const getNumberValue = (field: string, notice: TedNotice) => {
  return readNumber(getStringValue(field, notice));
};

export const getNumberArrayValue = (field: string, notice: TedNotice) => {
  return getStringArrayValue(field, notice).map((v) => readNumber(v));
};

export function toValidDate(value: string): Date | undefined {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function normalizeTenderTime(
  value: string | undefined,
  offset?: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const [baseTime, fraction] = value.split('.');
  const seconds = baseTime.length === 5 ? `${baseTime}:00` : baseTime;
  const milliseconds = fraction ? fraction.slice(0, 3).padEnd(3, '0') : '000';

  return `${seconds}.${milliseconds}${offset ?? 'Z'}`;
}

export function normalizeTenderDateText(value: string): string | undefined {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})(Z|[+-]\d{2}:\d{2})?(?:T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)(Z|[+-]\d{2}:\d{2})?)?/,
  );

  if (!match) {
    return undefined;
  }

  const date = match[1];
  const dateOffset = match[2];
  const time = normalizeTenderTime(match[3], match[4] ?? dateOffset);

  if (time) {
    return `${date}T${time}`;
  }

  return `${date}T00:00:00.000${dateOffset ?? 'Z'}`;
}

export function parseTenderDate(value: string | undefined): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (/^\d{8}$/.test(trimmed)) {
    return toValidDate(
      `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T00:00:00.000Z`,
    );
  }

  const normalized = normalizeTenderDateText(trimmed);

  if (normalized) {
    return toValidDate(normalized);
  }

  return toValidDate(trimmed);
}

export function getUniqArray<T>(...params: T[][] | T[]): any[] {
  const set = new Set();

  params.forEach((param) => {
    if (Array.isArray(param)) {
      const arr = param.flatMap((el) => el);

      arr.forEach((element: T) => {
        set.add(element);
      });
    } else {
      set.add(param);
    }
  });

  return Array.from(set).filter(Boolean);
}

function getComparableValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

export function getCommonArrayValue<T>(
  values: Array<T | null | undefined | ''>,
): T | undefined {
  const nonEmptyValues = values.filter(
    (value): value is T =>
      value !== undefined && value !== null && value !== '',
  );

  if (nonEmptyValues.length === 0) {
    return undefined;
  }

  const firstValue = nonEmptyValues[0];
  const firstComparableValue = getComparableValue(firstValue);

  return nonEmptyValues.every(
    (value) => getComparableValue(value) === firstComparableValue,
  )
    ? firstValue
    : undefined;
}

export function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() ?? '';
}

export function parseNoticeDateTime(
  date: string | undefined,
  time: string | undefined,
): Date | undefined {
  if (!date) {
    return undefined;
  }

  return readDate(time ? `${date}T${time}` : date) ?? undefined;
}

function getDatesSorted<
  T extends Date | string | undefined | Record<string, unknown>,
>(dates: T[], direction: 'DESC' | 'ASC', key?: string): T {
  return dates.filter(Boolean).sort((a, b) => {
    const aDate = new Date(key ? a?.[key] : a).getTime();
    const bDate = new Date(key ? b?.[key] : b).getTime();

    if (direction === 'DESC') {
      return aDate - bDate;
    }

    return bDate - aDate;
  })?.[0];
}

export function getEarliestDate<
  T extends Date | string | undefined | Record<string, unknown>,
>(dates: T[], key?: string) {
  return getDatesSorted(dates, 'DESC', key);
}

export function getLatestDate<
  T extends Date | string | undefined | Record<string, unknown>,
>(dates: T[], key?: string) {
  return getDatesSorted(dates, 'ASC', key);
}
