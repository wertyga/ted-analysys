import {
  isRecord,
  readDate,
  readNumber,
  readString,
  readStringArray,
} from '@/utils';
import { TenderDocument } from '@/resources/tenders/schemas';
import { TenderForMatching } from './tender-match.types';

export function mapTenderForMatching(
  tender: TenderDocument,
): TenderForMatching {
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
    lotTitles: readStringArray(tender.lots?.map((lot) => lot.title)),
    lotDescriptions: readStringArray(
      tender.lots?.map((lot) => lot.description),
    ),
  };
}

function readEstimatedValue(tender: TenderDocument): {
  amount?: number | null;
  currency?: string | null;
} {
  if (isRecord(tender.estimatedValue)) {
    return {
      amount: readEstimatedAmount(tender.estimatedValue.amount),
      currency: readString(tender.estimatedValue.currency),
    };
  }

  return {
    amount: readEstimatedAmount(tender.estimatedValue),
    currency: null,
  };
}

function readEstimatedAmount(value: unknown): number | null | undefined {
  const amount = readNumber(value);

  return !!amount ? amount : null;
}
