import type { TedNotice } from '@/resources/ted-search/types/ted-search.types';

export function valueToString(value: any): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = valueToString(item);

      if (text !== undefined && text.trim().length > 0) {
        return text;
      }
    }
  }

  if (isRecord(value)) {
    for (const key of ['ENG', 'eng', 'EN', 'en', 'value', 'text']) {
      const text = valueToString(value[key]);

      if (text !== undefined && text.trim().length > 0) {
        return text;
      }
    }
  }

  return undefined;
}

export function isTedPublicationNumber(value: string): boolean {
  return /^\d{4,8}-\d{4}$/.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTedNotice(value: unknown): value is TedNotice {
  return isRecord(value);
}

export function extractPublicationNumberFromNotice(
  notice: TedNotice,
): string | undefined {
  const value = notice.publicationNumber ?? notice['publication-number'];

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number') {
    const text = String(value);

    if (/^\d{9,12}$/.test(text)) {
      return `${text.slice(0, -4)}-${text.slice(-4)}`;
    }
  }

  return undefined;
}

export function areTedNoticeVersionsDifferent(
  localNoticeVersion: string | undefined,
  notice: TedNotice | undefined,
): boolean {
  if (!notice) {
    return false;
  }

  const noticeVersion = valueToString(
    notice.noticeVersion ?? notice['notice-version'],
  );

  return (
    noticeVersion !== undefined &&
    localNoticeVersion !== undefined &&
    localNoticeVersion !== noticeVersion
  );
}

export function isDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && (error.code === 11000 || error.code === '11000');
}

export function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
}

export function getString(
  record: Record<string, unknown>,
  key: string,
  fallback = '',
): string {
  const value = record[key];

  return typeof value === 'string' ? value : fallback;
}

export function getStringArray(
  record: Record<string, unknown>,
  key: string,
  fallback: string[] = [],
): string[] {
  const value = record[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : fallback;
}

export function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readString(value: unknown): string | undefined {
  const textValue = valueToString(value);

  if (textValue !== undefined) {
    const trimmed = textValue.trim();

    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  if (value instanceof Date) {
    return String(value);
  }

  if (isRecord(value) && typeof value.code === 'string') {
    return value.code;
  }

  return undefined;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item) => {
      const directValue = readString(item);

      if (directValue) {
        return [directValue];
      }

      if (isRecord(item)) {
        return [
          readString(item.code),
          readString(item.id),
          readString(item.value),
          readString(item.name),
        ].filter((nestedValue): nestedValue is string => Boolean(nestedValue));
      }

      return [];
    })
    .filter((item, index, array) => array.indexOf(item) === index);
}

export function readNumber(value: unknown): number | null | undefined {
  const nullableNumber = getNullableNumber(value);

  if (typeof nullableNumber === 'number' && Number.isFinite(nullableNumber)) {
    return nullableNumber;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function readDate(value: unknown): Date | null | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return value === null ? null : undefined;
}

export function toIsoString(value: unknown): string | null {
  const date = readDate(value);

  return date instanceof Date ? date.toISOString() : null;
}

export function toOptionalIsoString(value: unknown): string | undefined {
  return toIsoString(value) ?? undefined;
}

export function toNullableFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getNormalizedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function uniqueFlatMap<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
): string[] {
  return Array.from(
    new Set(
      items
        .flatMap((item) => (Array.isArray(item[key]) ? item[key] : []))
        .filter((value): value is string => typeof value === 'string'),
    ),
  );
}

export function getCpvCodeArray(value: unknown): string[] {
  return getNormalizedStringArray(value).filter((code) => /^\d{8}$/.test(code));
}

export function getOptionalPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.round(value);
}

export function getOptionalNonNegativeNumber(
  value: unknown,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.round(value);
}

export function getBoolean(
  record: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean {
  const value = record[key];

  return typeof value === 'boolean' ? value : fallback;
}

export function getNullableNumber(
  value: unknown,
  fallback: number | null = null,
): number | null {
  return value === null || typeof value === 'number' ? value : fallback;
}

export function getEnumOrNull<T extends Record<string, string>>(
  value: unknown,
  enumObject: T,
  fallback: T[keyof T] | null = null,
): T[keyof T] | null {
  const allowed = new Set(Object.values(enumObject));

  return typeof value === 'string' && allowed.has(value)
    ? (value as T[keyof T])
    : fallback;
}

export function getEnumArray<T extends Record<string, string>>(
  value: unknown,
  enumObject: T,
  fallback: T[keyof T][] = [],
): T[keyof T][] {
  const allowed = new Set(Object.values(enumObject));

  return Array.isArray(value)
    ? value.filter(
        (item): item is T[keyof T] =>
          typeof item === 'string' && allowed.has(item),
      )
    : fallback;
}
