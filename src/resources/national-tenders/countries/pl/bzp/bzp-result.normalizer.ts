import { Injectable } from '@nestjs/common';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import {
  NationalAwardLotStatus,
  NationalAwardWinner,
  NationalTenderBuyer,
  NationalTenderSource,
  NormalizedNationalAward,
  NormalizedNationalAwardLot,
} from '@/resources/national-tenders/core/national-tender.types';
import { PL_BZP_CONFIG } from '../pl.config';
import { firstValue, parseBzpHtml } from './bzp-html.parser';
import { BzpResultPart, parseBzpResultHtml } from './bzp-result.parser';
import {
  buildBzpTenderId,
  parseCpvCodes,
  parseDuration,
  parseMoney,
} from './bzp.normalizer';
import { BzpNotice } from './bzp.types';

const COUNTRY = 'POL';

const CONTRACT_NATURE: Record<string, TedContractNature> = {
  Delivery: TedContractNature.SUPPLIES,
  Services: TedContractNature.SERVICES,
  Works: TedContractNature.WORKS,
};

/** `procedureResult` values (one per part, ";"-separated). */
const PART_STATUS: Record<string, NationalAwardLotStatus> = {
  zawarcieUmowy: 'awarded',
  uniewaznienie: 'cancelled',
  nieRozstrzygnieto: 'unresolved',
};

/** ISO 3166-1 alpha-2 → alpha-3 for winner countries seen in BZP. */
const ISO3: Record<string, string> = {
  PL: 'POL',
  DE: 'DEU',
  CZ: 'CZE',
  SK: 'SVK',
  LT: 'LTU',
  LV: 'LVA',
  EE: 'EST',
  UA: 'UKR',
  NL: 'NLD',
  BE: 'BEL',
  FR: 'FRA',
  IT: 'ITA',
  ES: 'ESP',
  PT: 'PRT',
  AT: 'AUT',
  HU: 'HUN',
  RO: 'ROU',
  BG: 'BGR',
  DK: 'DNK',
  SE: 'SWE',
  FI: 'FIN',
  NO: 'NOR',
  IE: 'IRL',
  LU: 'LUX',
  SI: 'SVN',
  HR: 'HRV',
  GR: 'GRC',
  CY: 'CYP',
  MT: 'MLT',
  CH: 'CHE',
  GB: 'GBR',
  US: 'USA',
  CN: 'CHN',
  TR: 'TUR',
  IL: 'ISR',
};

const digits = (value?: string | null) =>
  value?.replace(/\D/g, '') || undefined;

const toText = (value?: string | null) => {
  const text = value?.replace(/\u00a0/g, ' ').trim();

  return text ? text : undefined;
};

const toInt = (value?: string) => {
  const number = Number((value ?? '').replace(/\s/g, ''));

  return value && Number.isInteger(number) ? number : undefined;
};

const toDate = (value?: string) => {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(value ?? '');

  return match ? new Date(`${match[1]}T00:00:00Z`) : undefined;
};

const money = (text?: string) => {
  const parsed = parseMoney(text);

  return parsed
    ? { amount: parsed.amount, currency: parsed.currency }
    : undefined;
};

function partStatus(
  notice: BzpNotice,
  part: BzpResultPart,
  index: number,
): NationalAwardLotStatus | undefined {
  const fromApi =
    PART_STATUS[
      (notice.procedureResult as string | null)?.split(';')[index] ?? ''
    ];

  if (fromApi) {
    return fromApi;
  }

  // Fallback: 5.1 text ("...zakończyła się zawarciem umowy" / "unieważnieniem").
  const text = (firstValue(part.fields, '5.1') ?? '').toLowerCase();

  if (/zawarciem umowy/.test(text)) return 'awarded';
  if (/unieważnieniem/.test(text)) return 'cancelled';

  return undefined;
}

function buildWinner(
  part: BzpResultPart,
  apiContractors: BzpNotice['contractors'],
): NationalAwardWinner | undefined {
  const fields = part.winners[0];
  const name = toText(firstValue(fields ?? {}, '7.3.1'));

  if (!fields || !name) {
    return undefined;
  }

  const nationalId = digits(firstValue(fields, '7.3.2'));
  const apiCountry = (
    (apiContractors as Array<{
      contractorNationalId?: string | null;
      contractorCountry?: string | null;
    }> | null) ?? []
  ).find(
    (contractor) =>
      nationalId && digits(contractor.contractorNationalId) === nationalId,
  )?.contractorCountry;
  const htmlCountry = /^polska$/i.test(firstValue(fields, '7.3.7') ?? '')
    ? COUNTRY
    : undefined;

  return {
    name,
    nationalId,
    street: toText(firstValue(fields, '7.3.3')),
    city: toText(firstValue(fields, '7.3.4')),
    postalCode: toText(firstValue(fields, '7.3.5')),
    country: (apiCountry && ISO3[apiCountry]) ?? htmlCountry,
    isJointVenture:
      /^tak/i.test(firstValue(part.fields, '7.1') ?? '') || undefined,
  };
}

/**
 * Normalizes a BZP `TenderResultNotice` (API JSON + parsed `htmlBody`) into
 * the shape of `AwardTender`. Pure: no I/O.
 */
export function normalizeBzpResultNotice(
  notice: BzpNotice,
): NormalizedNationalAward | undefined {
  const id = buildBzpTenderId(notice.bzpNumber);

  if (!id) {
    return undefined;
  }

  const parsed = parseBzpResultHtml(notice.htmlBody ?? '');
  const general = parseBzpHtml(notice.htmlBody ?? '').fields;
  const f = parsed.fields;
  const contractNature = CONTRACT_NATURE[notice.orderType];
  const procedureValue = money(firstValue(f, '4.3'));
  const singlePart = parsed.parts.length === 1;

  const lots = parsed.parts.map((part, index): NormalizedNationalAwardLot => {
    const p = part.fields;
    const description = toText(p['4.5.1']?.join('\n'));
    const status = partStatus(notice, part, index);
    const winner =
      status === 'awarded' ? buildWinner(part, notice.contractors) : undefined;

    return {
      identifier: `LOT-${String(part.number).padStart(4, '0')}`,
      title: description?.split('\n')[0]?.slice(0, 300),
      description,
      contractNature,
      mainClassification: parseCpvCodes(firstValue(p, '4.5.3')),
      estimatedValue:
        money(firstValue(p, '4.5.5')) ??
        (singlePart ? procedureValue : undefined),
      status,
      cancellationReason: toText(p['5.2.1']?.join('\n')),
      offersCount: toInt(firstValue(p, '6.1')),
      smeOffersCount: toInt(firstValue(p, '6.1.3')),
      lowestOfferValue: money(firstValue(p, '6.2')),
      highestOfferValue: money(firstValue(p, '6.3')),
      awardValue:
        status === 'awarded'
          ? (money(firstValue(p, '8.2')) ?? money(firstValue(p, '6.4')))
          : undefined,
      contractConclusionDate: toDate(firstValue(p, '8.1')),
      duration: parseDuration(p['8.3']?.join(' ')).duration,
      winner,
    };
  });

  const awarded = lots.filter((lot) => lot.awardValue?.amount);
  const currency = awarded[0]?.awardValue?.currency ?? null;
  const awardAmount = awarded.reduce(
    (sum, lot) =>
      lot.awardValue?.currency === currency
        ? sum + (lot.awardValue?.amount ?? 0)
        : sum,
    0,
  );
  const contractDates = Array.from(
    new Map(
      lots
        .map((lot) => lot.contractConclusionDate)
        .filter((date): date is Date => !!date)
        .map((date) => [date.getTime(), date] as const),
    ).values(),
  ).sort((a, b) => a.getTime() - b.getTime());
  const publicationDate = new Date(notice.publicationDate);

  const buyer: NationalTenderBuyer = {
    name: toText(notice.organizationName) ?? firstValue(general, '1.1') ?? '',
    nationalId: digits(notice.organizationNationalId),
    registryId: firstValue(general, '1.3'),
    sourceOrganizationId: toText(notice.organizationId),
    street: firstValue(general, '1.4.1'),
    city: toText(notice.organizationCity) ?? firstValue(general, '1.4.2'),
    postalCode: firstValue(general, '1.4.3'),
    country: COUNTRY,
    nuts: /\b(PL[0-9A-Z]{1,3})\b/.exec(firstValue(general, '1.4.6') ?? '')?.[1],
    email: firstValue(general, '1.4.9'),
    website: firstValue(general, '1.4.10'),
  };

  return {
    id,
    source: NationalTenderSource.PL_BZP,
    sourceId: notice.bzpNumber,
    sourceProcedureId: toText(notice.tenderId),
    sourceUrl: notice.tenderId
      ? `${PL_BZP_CONFIG.procedureUrlBase}${notice.tenderId}`
      : undefined,
    country: COUNTRY,
    title: toText(notice.orderObject),
    contractNature,
    cpvCodes: Array.from(
      new Set([
        ...parseCpvCodes(notice.cpvCode),
        ...lots.flatMap((lot) => lot.mainClassification),
      ]),
    ),
    publicationDate: Number.isNaN(publicationDate.getTime())
      ? undefined
      : publicationDate,
    estimatedValue: procedureValue,
    awardValue: { amount: awarded.length ? awardAmount : null, currency },
    contractConclusionDates: contractDates,
    awardDate: contractDates[contractDates.length - 1] ?? null,
    placeOfPerformanceCountries: [COUNTRY],
    lots,
    buyers: buyer.name ? [buyer] : [],
    rawData: notice,
  };
}

@Injectable()
export class BzpResultNormalizer {
  normalize(notice: BzpNotice): NormalizedNationalAward | undefined {
    return normalizeBzpResultNotice(notice);
  }
}
