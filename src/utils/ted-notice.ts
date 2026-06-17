import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import { readNumber, readDate } from './checking';

export const getArrayValue = (field: string, notice: TedNotice) => {
  return Array.isArray(notice[field]) ? notice[field] : [notice[field]];
};

export const getStringArrayValue = (field: string, notice: TedNotice) => {
  return getArrayValue(field, notice)
    .filter((f) => !!f && typeof f === 'string')
    .map((f: string) => f.trim());
};

export const getBooleanArrayValue = (field: string, notice: TedNotice) => {
  return getArrayValue(field, notice).map((f) =>
    Boolean(typeof f === 'string' ? f.trim() : f),
  );
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
