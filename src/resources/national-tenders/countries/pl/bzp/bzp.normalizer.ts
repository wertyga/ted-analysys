import { Injectable } from '@nestjs/common';
import { TenderDuration, TenderLot } from '@/resources/tenders/schemas';
import {
  TedContractNature,
  TedProcedureType,
} from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import {
  NationalTenderBuyer,
  NationalTenderLot,
  NationalTenderSource,
  NormalizedNationalTender,
} from '@/resources/national-tenders/core/national-tender.types';
import { PL_BZP_CONFIG } from '../pl.config';
import {
  BzpFieldMap,
  BzpParsedCriterion,
  firstValue,
  parseBzpHtml,
} from './bzp-html.parser';
import { BzpNotice, BzpNoticeType } from './bzp.types';

const COUNTRY = 'POL';

const CONTRACT_NATURE: Record<string, TedContractNature> = {
  Delivery: TedContractNature.SUPPLIES,
  Services: TedContractNature.SERVICES,
  Works: TedContractNature.WORKS,
};

/** BZP notice type → TED notice type used across the app. */
const NOTICE_TYPE: Partial<Record<string, string>> = {
  [BzpNoticeType.CONTRACT_NOTICE]: 'cn-standard',
};

const LANGUAGES: Record<string, string> = {
  polski: 'POL',
  angielski: 'ENG',
  niemiecki: 'DEU',
  francuski: 'FRA',
  ukraiński: 'UKR',
  czeski: 'CES',
  słowacki: 'SLK',
  litewski: 'LIT',
};

/** "2026/BZP 00531057" → "pl-bzp-2026-00531057". */
export function buildBzpTenderId(bzpNumber: string): string | undefined {
  const match = /(\d{4})\s*\/\s*BZP\s*(\d+)/i.exec(bzpNumber);

  return match ? `pl-bzp-${match[1]}-${match[2]}` : undefined;
}

/** Extracts 8-digit CPV codes (without check digit) from any BZP CPV text. */
export function parseCpvCodes(...texts: (string | null | undefined)[]) {
  const codes = texts.flatMap((text) =>
    Array.from((text ?? '').matchAll(/\b(\d{8})-\d\b/g), (m) => m[1]),
  );

  return Array.from(new Set(codes));
}

/** "1601774,85 PLN" → { amount: 1601774.85, currency: 'PLN' }; 0 → null. */
export function parseMoney(
  text?: string,
): { amount: number; currency: string } | undefined {
  const match = /(-?[\d\s.]*\d(?:,\d+)?)\s*([A-Z]{3})/.exec(
    (text ?? '').replace(/\u00a0/g, ' '),
  );

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1].replace(/[\s.]/g, '').replace(',', '.'));

  return Number.isFinite(amount) && amount > 0
    ? { amount, currency: match[2] }
    : undefined;
}

/** "14 dni" / "12 miesięcy" / "2 lata" → duration; "do 2026-12-31" → end date. */
export function parseDuration(text?: string): {
  duration?: TenderDuration;
  plannedEndDate?: Date;
} {
  if (!text) {
    return {};
  }

  const period =
    /(\d+)\s*(dni|dzie[nń]|tydzie[nń]|tygodni|miesi|rok|lat)/i.exec(text);

  if (period) {
    const value = Number(period[1]);
    const unit = period[2].toLowerCase();

    if (unit.startsWith('dni') || unit.startsWith('dzie')) {
      return { duration: { value, unit: 'DAY' } };
    }
    if (unit.startsWith('tydz') || unit.startsWith('tygod')) {
      return { duration: { value: value * 7, unit: 'DAY' } };
    }
    if (unit.startsWith('miesi')) {
      return { duration: { value, unit: 'MONTH' } };
    }

    return { duration: { value, unit: 'YEAR' } };
  }

  const date = /(\d{4}-\d{2}-\d{2})/.exec(text);

  return date ? { plannedEndDate: new Date(`${date[1]}T00:00:00Z`) } : {};
}

/** Maps "2.16 Tryb udzielenia zamówienia" text to a TED procedure type. */
export function mapProcedureType(text?: string): string | undefined {
  const value = (text ?? '').toLowerCase();

  if (!value) {
    return undefined;
  }
  if (value.includes('trybie podstawowym')) {
    // Art. 275 pkt 1: no negotiation (open-like); pkt 2/3: with negotiation.
    return /art\.\s*275\s*pkt\s*1\b/.test(value)
      ? TedProcedureType.OPEN
      : TedProcedureType.NEGOTIATED_WITH_CALL;
  }
  if (value.includes('przetargu nieograniczonego')) {
    return TedProcedureType.OPEN;
  }
  if (value.includes('przetargu ograniczonego')) {
    return TedProcedureType.RESTRICTED;
  }
  if (value.includes('negocjacji z ogłoszeniem')) {
    return TedProcedureType.NEGOTIATED_WITH_CALL;
  }
  if (value.includes('dialogu konkurencyjnego')) {
    return TedProcedureType.COMPETITIVE_DIALOGUE;
  }
  if (value.includes('partnerstwa innowacyjnego')) {
    return TedProcedureType.INNOVATION_PARTNERSHIP;
  }

  return undefined;
}

const isYes = (text?: string) =>
  text === undefined ? undefined : /^tak\b/i.test(text.trim());

const extractUrls = (texts: (string | undefined)[]) =>
  Array.from(
    new Set(
      texts.flatMap((text) =>
        Array.from((text ?? '').matchAll(/https?:\/\/[^\s<>"',;]+/gi), (m) =>
          m[0].replace(/[.)]+$/, ''),
        ),
      ),
    ),
  );

const toDate = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
};

const toText = (value?: string | null) => {
  const text = value?.replace(/\u00a0/g, ' ').trim();

  return text ? text : undefined;
};

function mapCriteria(criteria: BzpParsedCriterion[]) {
  return criteria.map((criterion) => {
    const label =
      `${criterion.type ?? ''} ${criterion.name ?? ''}`.toLowerCase();
    const weight = Number((criterion.weight ?? '').replace(',', '.'));

    return {
      name: criterion.name ?? null,
      type: /koszt/.test(label)
        ? 'cost'
        : /cena/.test(label)
          ? 'price'
          : 'quality',
      description: null,
      weight: Number.isFinite(weight) && criterion.weight ? weight : null,
    };
  });
}

function getCommonDuration(lots: NationalTenderLot[]) {
  const first = lots[0]?.duration;

  return first &&
    lots.every(
      (lot) =>
        lot.duration?.value === first.value &&
        lot.duration?.unit === first.unit,
    )
    ? first
    : undefined;
}

/**
 * Normalizes a BZP notice (API JSON + parsed `htmlBody`) into the shape of
 * `Tender`. Pure: no I/O.
 */
export function normalizeBzpNotice(
  notice: BzpNotice,
): NormalizedNationalTender | undefined {
  const id = buildBzpTenderId(notice.bzpNumber);

  if (!id) {
    return undefined;
  }

  const parsed = parseBzpHtml(notice.htmlBody ?? '');
  const f = parsed.fields;

  const deadline = toDate(notice.submittingOffersDate);
  const contractNature = CONTRACT_NATURE[notice.orderType];
  const isEuFunded = isYes(firstValue(f, '2.14'));
  const isFramework = /ramow/i.test(firstValue(f, '2.1') ?? '');
  const electronicSubmission =
    isYes(firstValue(f, '3.4')) === undefined
      ? undefined
      : isYes(firstValue(f, '3.4'))
        ? 'required'
        : 'allowed';

  const nuts = /\b(PL[0-9A-Z]{1,3})\b/.exec(firstValue(f, '1.5.6') ?? '')?.[1];
  const city = toText(notice.organizationCity) ?? firstValue(f, '1.5.2');

  const procedureUrlFromId = notice.tenderId
    ? `${PL_BZP_CONFIG.procedureUrlBase}${notice.tenderId}`
    : undefined;
  const procedureUrls = extractUrls(f['3.1'] ?? []);
  const submissionUrls = extractUrls([
    ...(f['8.2'] ?? []),
    ...(f['3.1'] ?? []),
  ]);
  const sourceUrl = procedureUrls[0] ?? procedureUrlFromId;
  const documentUrls = procedureUrls.length
    ? procedureUrls
    : procedureUrlFromId
      ? [procedureUrlFromId]
      : [];

  const procedureValue =
    parseMoney(firstValue(f, '4.1.6')) ?? parseMoney(firstValue(f, '4.1.5'));

  const buildLot = (
    index: number,
    fields: BzpFieldMap,
    criteria: BzpParsedCriterion[],
    value?: { amount: number; currency: string },
  ): NationalTenderLot => {
    const [main, ...rest] = parseCpvCodes(...(fields['4.2.6'] ?? []));
    const { duration, plannedEndDate } = parseDuration(
      firstValue(fields, '4.2.10'),
    );

    const lot: TenderLot = {
      identifier: `LOT-${String(index).padStart(4, '0')}`,
      description: toText((fields['4.2.2'] ?? []).join('\n')),
      mainClassification: main ? [main] : [],
      additionalClassifications: [
        ...rest,
        ...parseCpvCodes(...(fields['4.2.7'] ?? [])),
      ],
      contractNature,
      estimatedValue: value
        ? { amount: value.amount, currency: value.currency }
        : undefined,
      isFrameworkAgreement: isFramework,
      isEuFunded,
      duration,
      plannedEndDate,
      deadlineReceiptTender: deadline,
      questionsDeadline: undefined,
      documentUrls,
      submissionUrls,
      electronicSubmission,
      placeOfPerformanceCountry: COUNTRY,
      placeOfPerformanceSubdivision: nuts,
      placeOfPerformanceCity: city,
      awardCriteria: mapCriteria(criteria),
    };

    return lot;
  };

  const lots: NationalTenderLot[] = parsed.parts.length
    ? parsed.parts.map((part) =>
        buildLot(
          part.number,
          part.fields,
          part.criteria,
          parseMoney(firstValue(part.fields, '4.2.5')),
        ),
      )
    : [buildLot(1, f, parsed.criteria, procedureValue)];

  const apiCpvCodes = parseCpvCodes(notice.cpvCode);
  const lotCpvCodes = lots.flatMap((lot) => [
    ...(lot.mainClassification ?? []),
    ...(lot.additionalClassifications ?? []),
  ]);
  const mainCpv = apiCpvCodes[0] ?? lots[0]?.mainClassification?.[0];

  const description = parsed.parts.length
    ? parsed.parts
        .map((part, i) =>
          lots[i].description
            ? `Część ${part.number}: ${lots[i].description}`
            : '',
        )
        .filter(Boolean)
        .join('\n\n')
    : lots[0].description;

  const submissionLanguages = Array.from(
    new Set(
      (f['3.14'] ?? [])
        .flatMap((value) => value.toLowerCase().split(/[\s,;]+/))
        .map((word) => LANGUAGES[word])
        .filter((code): code is string => Boolean(code)),
    ),
  );

  const buyer: NationalTenderBuyer = {
    name: toText(notice.organizationName) ?? firstValue(f, '1.2') ?? '',
    nationalId: toText(notice.organizationNationalId),
    registryId: firstValue(f, '1.4'),
    sourceOrganizationId: toText(notice.organizationId),
    street: firstValue(f, '1.5.1'),
    city,
    postalCode: firstValue(f, '1.5.3'),
    country: COUNTRY,
    nuts,
    email: firstValue(f, '1.5.9'),
    website: firstValue(f, '1.5.10'),
    legalType: firstValue(f, '1.6'),
    mainActivity: firstValue(f, '1.7'),
  };

  return {
    id,
    source: NationalTenderSource.PL_BZP,
    sourceId: notice.bzpNumber,
    sourceProcedureId: toText(notice.tenderId),
    sourceNoticeType: notice.noticeType,
    sourceVersion: firstValue(f, '2.6'),
    sourceUrl,
    country: COUNTRY,
    isBelowEuThreshold: notice.isTenderAmountBelowEU,
    noticeType: NOTICE_TYPE[notice.noticeType] ?? notice.noticeType,
    procedureType: mapProcedureType(firstValue(f, '2.16')),
    title: toText(notice.orderObject) ?? toText(firstValue(f, '2.3')),
    description: toText(description),
    estimatedValue: procedureValue
      ? { amount: procedureValue.amount, currency: procedureValue.currency }
      : undefined,
    noticeLanguage: 'POL',
    submissionLanguages: submissionLanguages.length
      ? submissionLanguages
      : ['POL'],
    publicationDate: toDate(notice.publicationDate),
    submissionDeadline: deadline,
    duration: getCommonDuration(lots),
    contractNature,
    legalBasis: toText(firstValue(f, '2.16')),
    electronicSubmission,
    mainClassificationProc: mainCpv ? [mainCpv] : [],
    cpvCodes: Array.from(new Set([...apiCpvCodes, ...lotCpvCodes])),
    placeOfPerformanceCountries: [COUNTRY],
    // BZP contract notices carry no place of performance; buyer location is
    // the closest available signal.
    placeOfPerformanceSubdivisions: nuts ? [nuts] : [],
    placeOfPerformanceCities: city ? [city] : [],
    lots,
    documentUrls,
    submissionUrls,
    euFundLot: isEuFunded,
    buyers: buyer.name ? [buyer] : [],
    rawData: notice,
  };
}

@Injectable()
export class BzpNormalizer {
  normalize(notice: BzpNotice): NormalizedNationalTender | undefined {
    return normalizeBzpNotice(notice);
  }
}
