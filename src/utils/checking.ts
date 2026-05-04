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
  return /^\d{5,8}-\d{4}$/.test(value);
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
