import { getNullableNumber, isRecord, valueToString } from '@/utils';
import { TenderDocument } from '@/resources/tenders/schemas';
import { TenderForMatching } from './tender-match.types';

export function mapTenderForMatching(tender: TenderDocument): TenderForMatching {
  const estimatedValue = readEstimatedValue(tender);

  return {
    id: readString(tender.id) ?? readString(tender._id) ?? '',
    title: readString(tender.title) ?? '',
    description: readString(tender.description),
    cpvCodes: readStringArray(tender.cpvCodes),
    country: null,
    buyerCountry: readString(tender.buyerCountry),
    placeOfPerformanceCountry:
      readStringArray(tender.placeOfPerformanceCountries)[0] ?? null,
    estimatedValue: estimatedValue.amount,
    currency: estimatedValue.currency,
    publicationDate: readDate(tender.publicationDate),
    deadlineAt:
      readDate(tender.submissionDeadline) ??
      readDate(tender.deadlineReceiptTender),
    contractNature: readString(tender.contractNature),
    procedureType: readString(tender.procedureType),
    languages: [
      ...readStringArray(tender.submissionLanguages),
      ...(readString(tender.noticeLanguage)
        ? [readString(tender.noticeLanguage) as string]
        : []),
    ],
    buyerName: readString(tender.buyerName),
    titleLot: readStringArray(tender.titleLot),
    descriptionLot: readStringArray(tender.descriptionLot),
  };
}

function readEstimatedValue(tender: TenderDocument): {
  amount?: number | null;
  currency?: string | null;
} {
  if (isRecord(tender.estimatedValue)) {
    return {
      amount: readNumber(tender.estimatedValue.amount),
      currency: readString(tender.estimatedValue.currency),
    };
  }

  return {
    amount: readNumber(tender.estimatedValue),
    currency: null,
  };
}

function readString(value: unknown): string | undefined {
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

// TODO: move to utils/checking.ts if another mapper needs object-aware array coercion.
function readStringArray(value: unknown): string[] {
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

function readNumber(value: unknown): number | null | undefined {
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

// TODO: move to utils/checking.ts if date coercion is needed outside tender matching.
function readDate(value: unknown): Date | null | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return value === null ? null : undefined;
}
