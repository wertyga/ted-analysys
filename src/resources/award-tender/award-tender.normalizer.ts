import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import {
  getArrayValue,
  getBooleanArrayValue,
  getDateArrayValue,
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

export type NormalizedAwardTenderLot = Omit<
  AwardTenderLot,
  'estimatedValueEur' | 'awardValueEur'
>;

type NormalizedAwardTender = Omit<
  AwardTender,
  '_id' | 'estimatedValueEur' | 'awardValueEur' | 'winners' | 'lots' | 'buyer'
> & {
  lots: NormalizedAwardTenderLot[];
};

export class AwardTenderNormalizer {
  tenderNormalizer = new TenderNormalizerService();

  normalizeAwardLotsNotice(notice: TedNotice): NormalizedAwardTenderLot[] {
    const data = {
      resultValues: getNumberArrayValue('result-value-lot', notice),
      resultValuesCurs: getArrayValue('result-value-cur-lot', notice),
      resultLotIdentifiers: getArrayValue('result-lot-identifier', notice),
    };

    const tenderLots = this.tenderNormalizer.normalizeTenderLotsNotice(notice);

    return tenderLots.map((l, i) => {
      return {
        ...l,
        resultLotIdentifier: data.resultLotIdentifiers?.[i],
        awardValue: {
          amount: data.resultValues?.[i] ?? null,
          currency: data.resultValuesCurs?.[i] ?? data.resultValuesCurs?.[0],
        },
      };
    });
  }

  normalizeAwardTenderNotice(notice: TedNotice): NormalizedAwardTender {
    const awardLots = this.normalizeAwardLotsNotice(notice);

    const frameworkData =
      this.tenderNormalizer.normalizeFrameworkFromTEDNotice(notice);

    const data = {
      id: getStringValue('publication-number', notice),
      noticeType: getStringValue('notice-type', notice),
      noticeSubtype: getStringValue('notice-subtype', notice),
      noticeVersion: getStringValue('notice-version', notice),
      procedureType: getStringValue('procedure-type', notice),
      title: getEngValueOrFirst('notice-title', notice),
      titleProc: getEngValueOrFirst('title-proc', notice),
      description: getEngValueOrFirst('description-proc', notice),

      selectionStatuses: getStringArrayValue('winner-selection-status', notice),

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
      awardDecisionDates: getDateArrayValue('winner-decision-date', notice).map(
        (d) => (d ? d.toISOString() : ''),
      ),
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

      isFrameworkAgreement: frameworkData.isFrameworkAgreements,
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
    const data: Record<keyof WinnerNormalized, string[] | boolean[]> = {
      name: getStringArrayValue('winner-name', notice),
      identifier: getStringArrayValue('winner-identifier', notice),
      countries: getStringArrayValue('winner-country', notice),
      countrySubs: getStringArrayValue('winner-country-sub', notice),
      cities: getStringArrayValue('winner-city', notice),
      postCodes: getStringArrayValue('winner-post-code', notice),
      size: getStringArrayValue('winner-size', notice),
      listed: getBooleanArrayValue('winner-listed', notice),
      internetAddresses: getStringArrayValue('winner-internet-address', notice),
      email: getStringArrayValue('winner-email', notice),
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
        winners[i] = {
          ...(winners[i] ?? {}),
          [key]: values[i],
        };
      }
    });

    return winners;
  }
}
