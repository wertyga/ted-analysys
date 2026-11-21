import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import {
  getArrayValue,
  getBooleanArrayValue,
  getDateArrayValue,
  getDateISOStringArrayValue,
  getDateValue,
  getEngValueOrFirst,
  getLatestDate,
  getNumberArrayValue,
  getNumberValue,
  getStringArrayValue,
  getStringValue,
  getUniqArray,
} from '@/utils';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { AwardTender, AwardTenderLot } from './schemas';
import { TenderNormalizerService } from '@/resources/tender-normalizer/tender-normalizer.service';
import { WinnerNormalized } from '@/resources/contractor/contractor.service';
import {
  extractLotWinnersFromXml,
  LotWinnerResult,
} from '@/resources/award-tender/utils';
import fs from 'node:fs';

const MAX_REASONABLE_AWARD_VALUE = 1_000_000_000_000;

export type NormalizedAwardTenderLot = Omit<
  AwardTenderLot,
  'estimatedValueEur' | 'awardValueEur'
> & {
  resultLotIdentifier?: string;
};

type NormalizedAwardTender = Omit<
  AwardTender,
  | '_id'
  | 'estimatedValueEur'
  | 'awardValueEur'
  | 'awardValueCorrections'
  | 'awardDate'
  | 'winners'
  | 'lots'
  | 'nonLeadBuyers'
  | 'leadBuyers'
> & {
  lots: NormalizedAwardTenderLot[];
};

export class AwardTenderNormalizer {
  tenderNormalizer = new TenderNormalizerService();

  async normalizeAwardTenderLotsAndWinners(notice: TedNotice): Promise<{
    lots: NormalizedAwardTenderLot[];
    winners: WinnerNormalized[];
    lotWinners: { lotIdentifier: string; winnerKey: string }[];
  }> {
    const noticeWinners = this.normalizeWinnersNotice(notice);
    const noticeLots = await this.normalizeAwardLotsNotice(notice);
    const xmlLots = await extractLotWinnersFromXml(notice.links);

    const lots: NormalizedAwardTenderLot[] = noticeLots.map((l) => {
      const xmlLot = xmlLots.find(
        (xl) => xl.lotId === l.identifier || xl.lotId === l.resultLotIdentifier,
      );

      return {
        ...l,
        awardValue: {
          amount: this.getXmlAwardValue(xmlLot) ?? l.awardValue?.amount ?? null,
          currency: xmlLot?.awardCurrency ?? l.awardValue?.currency ?? null,
        },
        tenderValueRange: xmlLot?.tenderValueRange ?? null,
      };
    });

    const winnersByKey = new Map<string, WinnerNormalized>();

    const upsertWinner = (winner: WinnerNormalized): string | null => {
      const winnerKey = this.getWinnerKey(winner);

      if (!winnerKey) {
        return null;
      }

      winnersByKey.set(
        winnerKey,
        this.mergeWinners(winnersByKey.get(winnerKey), winner),
      );

      return winnerKey;
    };

    noticeWinners.forEach(upsertWinner);

    const lotWinners = xmlLots.flatMap((xmlLot) => {
      const lot = lots.find(
        (l) =>
          l.identifier === xmlLot.lotId ||
          l.resultLotIdentifier === xmlLot.lotId,
      );
      const winner = this.normalizeXmlWinner(xmlLot);
      const winnerKey = upsertWinner(winner);

      if (!lot?.identifier || !winnerKey) {
        return [];
      }

      return [{ lotIdentifier: lot.identifier, winnerKey }];
    });

    return {
      lots,
      winners: Array.from(winnersByKey.values()),
      lotWinners,
    };
  }

  private getXmlAwardValue(xmlLot?: LotWinnerResult): number | null {
    if (
      !xmlLot ||
      xmlLot.awardValue === null ||
      !Number.isFinite(xmlLot.awardValue) ||
      xmlLot.awardValue < 0 ||
      xmlLot.awardValue > MAX_REASONABLE_AWARD_VALUE
    ) {
      return null;
    }

    return xmlLot.awardValue;
  }

  private normalizeXmlWinner(xmlLot: LotWinnerResult): WinnerNormalized {
    return {
      name: xmlLot.winner.name ?? undefined,
      identifiers: this.compactUniq([xmlLot.winner.identifier]),
      countries: this.compactUniq([xmlLot.winner.country]),
      cities: this.compactUniq([xmlLot.winner.city]),
      postCodes: this.compactUniq([xmlLot.winner.postCode]),
      size: xmlLot.winner.size ?? undefined,
      internetAddresses: this.compactUniq([xmlLot.winner.website]),
      emails: this.compactUniq([xmlLot.winner.email]),
    };
  }

  getWinnerKey(winner: WinnerNormalized): string | null {
    const identifier = winner.identifiers?.find(Boolean);

    if (identifier) {
      return `identifier:${identifier}`;
    }

    const email = winner.emails?.find(Boolean);

    if (email) {
      return `email:${email.trim().toLowerCase()}`;
    }

    if (winner.name) {
      return [
        'name',
        winner.name,
        winner.countries?.[0] ?? '',
        winner.cities?.[0] ?? '',
      ]
        .join(':')
        .toLowerCase();
    }

    return null;
  }

  private mergeWinners(
    current: WinnerNormalized | undefined,
    next: WinnerNormalized,
  ): WinnerNormalized {
    if (!current) {
      return next;
    }

    return {
      ...current,
      ...next,
      name: next.name || current.name,
      identifiers: this.compactUniq([
        ...(current.identifiers ?? []),
        ...(next.identifiers ?? []),
      ]),
      countries: this.compactUniq([
        ...(current.countries ?? []),
        ...(next.countries ?? []),
      ]),
      countrySubs: this.compactUniq([
        ...(current.countrySubs ?? []),
        ...(next.countrySubs ?? []),
      ]),
      cities: this.compactUniq([
        ...(current.cities ?? []),
        ...(next.cities ?? []),
      ]),
      postCodes: this.compactUniq([
        ...(current.postCodes ?? []),
        ...(next.postCodes ?? []),
      ]),
      internetAddresses: this.compactUniq([
        ...(current.internetAddresses ?? []),
        ...(next.internetAddresses ?? []),
      ]),
      emails: this.compactUniq([
        ...(current.emails ?? []),
        ...(next.emails ?? []),
      ]),
      ownerNationalities: this.compactUniq([
        ...(current.ownerNationalities ?? []),
        ...(next.ownerNationalities ?? []),
      ]),
      euRegistrationNumber:
        next.euRegistrationNumber ?? current.euRegistrationNumber,
    };
  }

  private compactUniq<T>(values: Array<T | null | undefined | ''>): T[] {
    return Array.from(
      new Set(
        values.filter(
          (value): value is T =>
            value !== undefined && value !== null && value !== '',
        ),
      ),
    );
  }

  async normalizeAwardLotsNotice(
    notice: TedNotice,
  ): Promise<NormalizedAwardTenderLot[]> {
    const data = {
      resultValues: getNumberArrayValue('result-value-lot', notice),
      resultValuesCurs: getArrayValue('result-value-cur-lot', notice),
      resultLotIdentifiers: getArrayValue('result-lot-identifier', notice),
    };

    const tenderLots =
      await this.tenderNormalizer.normalizeTenderLotsNotice(notice);

    return tenderLots.map((l, i) => {
      return {
        ...l,
        resultLotIdentifier: data.resultLotIdentifiers?.[i],
        awardValue: {
          // No estimate fallback: an estimate is not an awarded value
          amount: data.resultValues?.[i] ?? null,
          currency:
            data.resultValuesCurs?.[i] ??
            data.resultValuesCurs?.[0] ??
            l.estimatedValue?.currency,
        },
      };
    });
  }

  async normalizeAwardTenderNotice(
    notice: TedNotice,
  ): Promise<NormalizedAwardTender> {
    const awardLots = await this.normalizeAwardLotsNotice(notice);

    const data = {
      id: getStringValue('publication-number', notice),
      noticeType: getStringValue('notice-type', notice),
      noticeSubtype: getStringValue('notice-subtype', notice),
      noticeVersion: getStringValue('notice-version', notice),
      procedureId: getStringValue('procedure-identifier', notice) || undefined,
      procedureType: getStringValue('procedure-type', notice),
      title: getEngValueOrFirst('notice-title', notice),
      titleProc: getEngValueOrFirst('title-proc', notice),
      description: getEngValueOrFirst('description-proc', notice),

      selectionStatuses: getStringArrayValue('winner-selection-status', notice),

      contractConclusionDates: getDateArrayValue(
        'contract-conclusion-date',
        notice,
      ) as Date[],

      publicationDate: getDateValue('publication-date', notice),
      dispatchDate: getDateValue('dispatch-date', notice),
      submissionDeadline: getDateValue('deadline', notice),
      contractNature: getStringValue(
        'contract-nature-main-proc',
        notice,
      ) as TedContractNature,
      mainClassificationProc: getStringArrayValue(
        'main-classification-proc',
        notice,
      ),
      cpvCodes: getStringArrayValue('classification-cpv', notice),
      placeOfPerformanceCountriesProc: getStringArrayValue(
        'place-of-performance-country-proc',
        notice,
      ),
      placeOfPerformanceCitiesProc: getStringArrayValue(
        'place-of-performance-city-proc',
        notice,
      ),

      links: notice.links,

      selectionCriteriaSources: getStringArrayValue(
        'selection-criteria-source',
        notice,
      ),

      estimatedValue: getNumberValue('estimated-value-proc', notice),
      estimatedValueCur: getStringValue('estimated-value-cur-proc', notice),

      resulValue: getNumberValue('result-value-notice', notice),
      resulValueCur: getStringValue('result-value-cur-notice', notice),

      awardDecisionDates: getDateISOStringArrayValue(
        'winner-decision-date',
        notice,
      ),
    };

    const lotsCodes: string[] = awardLots.flatMap(
      ({ mainClassification, additionalClassifications }) => {
        return [
          ...(mainClassification ?? []),
          ...(additionalClassifications ?? []),
        ];
      },
    );
    const maxEndDate = getLatestDate(awardLots.map((l) => l.plannedEndDate));

    return {
      ...data,
      awardValue: this.tenderNormalizer.getMoneyValueFromNotice(
        ['result-value-notice', 'total-value'],
        ['result-value-cur-notice', 'total-value-cur'],
        notice,
      ),
      estimatedValue: this.tenderNormalizer.getMoneyValueFromNotice(
        ['estimated-value-proc', 'total-value'],
        ['estimated-value-cur-proc', 'total-value-cur'],
        notice,
      ),
      cpvCodes: Array.from(
        new Set([
          ...lotsCodes,
          ...data.cpvCodes,
          ...data.mainClassificationProc,
        ]),
      ),

      lots: awardLots,

      placeOfPerformanceCities: getUniqArray(
        data.placeOfPerformanceCitiesProc,
        awardLots.map((l) => l.placeOfPerformanceCity),
      ),
      placeOfPerformanceCountries: getUniqArray(
        data.placeOfPerformanceCountriesProc,
        awardLots.map((l) => l.placeOfPerformanceCountry),
      ),
      placeOfPerformanceSubdivisions: getUniqArray(
        awardLots.map((l) => l.placeOfPerformanceSubdivision),
      ),

      plannedEndDate: maxEndDate,
    };
  }

  normalizeWinnersNotice(notice: TedNotice): WinnerNormalized[] {
    const data = {
      name: getStringArrayValue('winner-name', notice),
      identifiers: getStringArrayValue('winner-identifier', notice),
      countries: getStringArrayValue('winner-country', notice),
      countrySubs: getStringArrayValue('winner-country-sub', notice),
      cities: getStringArrayValue('winner-city', notice),
      postCodes: getStringArrayValue('winner-post-code', notice),
      size: getStringArrayValue('winner-size', notice),
      listed: getBooleanArrayValue('winner-listed', notice),
      internetAddresses: getStringArrayValue('winner-internet-address', notice),
      emails: getStringArrayValue('winner-email', notice),
      ownerNationalities: getStringArrayValue(
        'winner-owner-nationality',
        notice,
      ),
      euRegistrationNumber: getStringArrayValue(
        'eu-registration-number',
        notice,
      ),
    };

    const maxLength = Math.max(
      ...Object.values(data).flatMap((r) => r.length),
      0,
    );

    if (!maxLength) {
      return [];
    }

    const winners = new Array(maxLength).fill(undefined);

    Object.entries(data).forEach(([key, values]) => {
      for (let i = 0; i < maxLength; i++) {
        const value = values[i];

        if (value === undefined) {
          continue;
        }

        winners[i] = {
          ...(winners[i] ?? {}),
          [key]: [
            'identifiers',
            'countries',
            'countrySubs',
            'cities',
            'postCodes',
            'internetAddresses',
            'emails',
            'ownerNationalities',
          ].includes(key)
            ? [value]
            : value,
        };
      }
    });

    return winners.filter(Boolean);
  }
}
