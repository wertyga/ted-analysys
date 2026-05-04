import { TedNotice, TedSearchResponse } from '../types/ted-search.types';
import { CpvCategoryModel } from '../../cpv/schemas';
import { isRecord } from '@/utils';
import { CPV_CODES_LIST_FIELDS } from '@/resources/cpv/cpv.service';

type JsonRecord = Record<string, unknown>;
type NormalizedCpvCategory = {
  code: string;
  name?: string;
  parentCode?: string;
  level?: number;
};

export function tenderNormilizer(tender: TedNotice): TedNotice {
  return normalizeValue(tender, undefined, new WeakSet<object>()) as TedNotice;
}

export async function normalizeTenderSearchResponse(
  response: TedSearchResponse,
): Promise<TedSearchResponse> {
  if (!Array.isArray(response.notices)) {
    return response;
  }

  return {
    ...response,
    notices: await Promise.all(
      response.notices
        .map(tenderNormilizer)
        .map((notice) => fillClassificationCpvByCodes(notice)),
    ),
  };
}

export async function fillClassificationCpvByCodes(
  tender: TedNotice,
): Promise<TedNotice> {
  const codes = extractCpvCodes(tender.classificationCpv);

  if (codes.length === 0) {
    return tender;
  }

  const categories = await CpvCategoryModel.find({ code: { $in: codes } })
    .select(CPV_CODES_LIST_FIELDS)
    .lean();
  const byCode = new Map(
    categories.map((category) => [category.code, category]),
  );

  return {
    ...tender,
    classificationCpv: codes.map<NormalizedCpvCategory>((code) => {
      const category = byCode.get(code);

      if (category === undefined) {
        return { code };
      }

      return {
        _id: category._id,
        code: category.code,
        name: category.name,
        parentCode: category.parentCode,
        level: category.level,
      };
    }),
  };
}

function normalizeValue(
  value: unknown,
  sourceKey?: string,
  seen: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return [];
    }

    seen.add(value);

    if (isBuyerCountryKey(sourceKey)) {
      return Array.from(
        new Set(value.map(toCountryCode).filter(isNonEmptyString)),
      );
    }

    return Array.from(
      new Set(value.map((item) => normalizeValue(item, undefined, seen))),
    );
  }

  if (!isRecord(value)) {
    if (isBuyerCountryKey(sourceKey) && value !== undefined && value !== null) {
      const text = toCountryCode(value);

      return text === undefined ? [] : Array.from(new Set([text]));
    }

    return value;
  }

  if (seen.has(value)) {
    return {};
  }

  seen.add(value);

  return Object.entries(value).reduce<JsonRecord>((acc, [key, nestedValue]) => {
    const normalizedKey = shouldUppercaseNestedKey(sourceKey)
      ? key.toUpperCase()
      : toCamelCase(key);
    acc[normalizedKey] = normalizeValue(nestedValue, key, seen);

    return acc;
  }, {});
}

function toCamelCase(value: string): string {
  return value.replace(/[-_\s]+([A-Za-z0-9])/g, (_, char: string) =>
    char.toUpperCase(),
  );
}

function isBuyerCountryKey(key: string | undefined): boolean {
  return key === 'buyer-country' || key === 'buyerCountry';
}

function isNoticeTitleKey(key: string | undefined): boolean {
  return key === 'notice-title' || key === 'noticeTitle';
}

function isBuyerNameKey(key: string | undefined): boolean {
  return key === 'buyer-name' || key === 'buyerName';
}

function shouldUppercaseNestedKey(key: string | undefined): boolean {
  return isNoticeTitleKey(key) || isBuyerNameKey(key);
}

function toCountryCode(value: unknown): string | undefined {
  return toText(value)?.toUpperCase();
}

function toText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function extractCpvCodes(value: unknown): string[] {
  const codes = new Set<string>();

  collectCpvCodes(value, codes);

  return Array.from(codes).sort();
}

function collectCpvCodes(value: unknown, codes: Set<string>): void {
  if (typeof value === 'string' || typeof value === 'number') {
    const matches = String(value).match(/\b\d{8}\b/g) ?? [];

    for (const match of matches) {
      codes.add(match);
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCpvCodes(item, codes);
    }

    return;
  }

  if (isRecord(value)) {
    for (const nestedValue of Object.values(value)) {
      collectCpvCodes(nestedValue, codes);
    }
  }
}
