import { Injectable } from '@nestjs/common';
import { TedNotice } from '../ted-search/types/ted-search.types';
import { TenderDto } from '@/resources/tenders/dto/tender.dto';
import {
  getArrayValue,
  getBooleanArrayValue,
  getCommonArrayValue,
  getDateArrayValue,
  getDateValue,
  getEarliestDate,
  getEngValueOrFirst,
  getLatestDate,
  getNumberArrayValue,
  getNumberValue,
  getStringArrayValue,
  getStringValue,
  getUniqArray,
  parseNoticeDateTime,
} from '@/utils';
import { MoneyValue, TenderLot } from '@/resources/tenders/schemas';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';

export type NormalizedTenderDto = Omit<TenderDto, '_id' | 'buyer'>;

export type NormalizedTenderLot = Omit<TenderLot, 'estimatedValueEur'>;

@Injectable()
export class TenderNormalizerService {
  normalizeFrameworkFromTEDNotice(notice: TedNotice) {
    const data = {
      frameworkEstimatedValues: getNumberArrayValue(
        'framework-estimated-value',
        notice,
      ),
      frameworkEstimatedValueCur: getStringValue(
        'framework-estimated-value-cur',
        notice,
      ),
      frameworkValue: getNumberValue('framework-value-notice', notice),
      frameworkValueCur: getStringValue('framework-value-cur-notice', notice),
      frameworkApproximateValue: getNumberValue(
        'framework-approximate-value-notice',
        notice,
      ),
      frameworkApproximateValueCur: getStringValue(
        'framework-approximate-value-cur-notice',
        notice,
      ),
      resultFrameworkMaximumValue: getNumberValue(
        'result-framework-maximum-value-notice',
        notice,
      ),
      resultFrameworkMaximumValueCur: getStringValue(
        'result-framework-maximum-value-cur-notice',
        notice,
      ),
    };

    return {
      isFrameworkAgreements: getStringArrayValue(
        'framework-agreement-lot',
        notice,
      ).some((s) => !!s && s !== 'none'),
      frameworkEstimated: {
        value: data.frameworkEstimatedValues.reduce((acc: number, num) => {
          return Number.isNaN(num) ? acc : acc + (num as number);
        }, 0),
        currency: data.frameworkEstimatedValueCur,
      },
      frameworkValue: {
        value: Number.isNaN(data.frameworkValue) ? 0 : data.frameworkValue,
        currency: data.frameworkValueCur,
      },
      frameworkApprox: {
        value: Number.isNaN(data.frameworkApproximateValue)
          ? 0
          : data.frameworkApproximateValue,
        currency: data.frameworkApproximateValueCur,
      },
      resultFrameworkValue: {
        value: Number.isNaN(data.resultFrameworkMaximumValue)
          ? 0
          : data.resultFrameworkMaximumValue,
        currency: data.resultFrameworkMaximumValueCur,
      },
    };
  }

  normalizeTenderLotsNotice(notice: TedNotice): NormalizedTenderLot[] {
    const data = {
      identifiers: getArrayValue('identifier-lot', notice),
      titles: getEngValueOrFirst('title-lot', notice),
      descriptions: getEngValueOrFirst('description-lot', notice),
      mainClassifications: getArrayValue('main-classification-lot', notice),
      additionalClassifications: getArrayValue(
        'additional-classification-lot',
        notice,
      ),
      contractNatures: getArrayValue('contract-nature-main-lot', notice),
      estimatedValues: getNumberArrayValue('estimated-value-lot', notice),
      estimatedValuesCurs: getArrayValue('estimated-value-cur-lot', notice),
      frameworkMaximumValues: getNumberArrayValue(
        'framework-maximum-value-lot',
        notice,
      ),
      frameworkMaximumValuesCurs: getArrayValue(
        'framework-maximum-value-cur-lot',
        notice,
      ),
      areFrameworkAgreements: getArrayValue(
        'framework-agreement-lot',
        notice,
      ).map((s) => !!s && s !== 'none'),

      plannedEndDates: getDateArrayValue(
        'contract-duration-end-date-lot',
        notice,
      ),
      plannedStartDates: getDateArrayValue(
        'contract-duration-start-date-lot',
        notice,
      ),

      dpsUsages: getArrayValue('dps-usage-lot', notice).map(
        (c) => !!c && c !== 'none',
      ),
      durationPeriodValues: getNumberArrayValue(
        'duration-period-value-lot',
        notice,
      ),
      durationPeriodUnits: getArrayValue('duration-period-unit-lot', notice),

      deadlineDates: getArrayValue('deadline-receipt-tender-date-lot', notice),
      deadlineTimes: getArrayValue('deadline-receipt-tender-time-lot', notice),
      questionsDeadlineDates: getArrayValue(
        'deadline-receipt-answers-date-lot',
        notice,
      ),
      questionsDeadlineTimes: getArrayValue(
        'deadline-receipt-answers-time-lot',
        notice,
      ),

      documentUrls: getArrayValue('document-url-lot', notice),
      submissionUrls: getArrayValue('submission-url-lot', notice),
      electronicSubmissions: getArrayValue('electronic-submission-lot', notice),

      awardCriterionTypes: getArrayValue('award-criterion-type-lot', notice),

      awardCriterionNumberWeights: getArrayValue(
        'award-criterion-number-weight-lot',
        notice,
      ),
      awardCriterionNumbers: getNumberArrayValue(
        'award-criterion-number-lot',
        notice,
      ),
      awardCriterionDescriptions: getEngValueOrFirst(
        'award-criterion-description-lot',
        notice,
      ),
      selectionCriterionNames: getArrayValue(
        'selection-criterion-name-lot',
        notice,
      ),
      selectionCriterionDescriptions: getArrayValue(
        'selection-criterion-description-lot',
        notice,
      ),
      placeOfPerformanceCountries: getArrayValue(
        'place-of-performance-country-lot',
        notice,
      ),
      placeOfPerformanceCities: getArrayValue(
        'place-of-performance-city-lot',
        notice,
      ),
      placeOfPerformanceSubdivisions: getArrayValue(
        'place-of-performance-subdiv-lot',
        notice,
      ),

      areSMEs: getBooleanArrayValue('sme-lot', notice),
      euFundLots: getBooleanArrayValue('eu-fund-lot', notice),
    };

    const length = Math.max(...Object.values(data).map((v) => v?.length ?? 0));

    if (length === 0) {
      return [];
    }

    return Array.from({ length }, (_, i) => {
      const durationValue = data.durationPeriodValues?.[i];
      const durationUnit = data.durationPeriodUnits?.[i];

      return {
        isSME: data.areSMEs?.[i],
        identifier: data.identifiers?.[i],
        title: data.titles?.[i],

        isEuFunded: data.euFundLots?.[i],

        plannedEndDate: data.plannedEndDates?.[i],
        plannedStartDate: data.plannedStartDates?.[i],

        description: data.descriptions?.[i],
        mainClassification: (Array.isArray(data.mainClassifications?.[i])
          ? data.mainClassifications?.[i]
          : [data.mainClassifications?.[i]]
        ).filter(Boolean),
        additionalClassifications: (Array.isArray(
          data.additionalClassifications?.[i],
        )
          ? data.additionalClassifications?.[i]
          : [data.additionalClassifications?.[i]]
        ).filter(Boolean),
        contractNature: data.contractNatures?.[i],
        estimatedValue: {
          amount: data.estimatedValues?.[i] ?? null,
          currency:
            data.estimatedValuesCurs?.[i] ?? data.estimatedValuesCurs?.[0],
        },
        frameworkMaximumValue: {
          amount: data.frameworkMaximumValues?.[i] ?? null,
          currency:
            data.frameworkMaximumValuesCurs?.[i] ??
            data.frameworkMaximumValuesCurs?.[0],
        },
        isFrameworkAgreement: data.areFrameworkAgreements?.[i],
        isDps: data.dpsUsages?.[i],
        duration:
          durationValue !== undefined || durationUnit
            ? {
                value: durationValue,
                unit: durationUnit ?? null,
              }
            : undefined,

        documentUrls: Array.isArray(data.documentUrls?.[i])
          ? data.documentUrls?.[i]
          : [data.documentUrls?.[i]].filter(Boolean),
        submissionUrls: Array.isArray(data.submissionUrls?.[i])
          ? data.submissionUrls?.[i]
          : [data.submissionUrls?.[i]].filter(Boolean),
        electronicSubmission: data.electronicSubmissions?.[i],

        deadlineReceiptTender: parseNoticeDateTime(
          data.deadlineDates?.[i],
          data.deadlineTimes?.[i],
        ),
        questionsDeadline: parseNoticeDateTime(
          data.questionsDeadlineDates?.[i],
          data.questionsDeadlineTimes?.[i],
        ),

        placeOfPerformanceCountry: data.placeOfPerformanceCountries?.[i],
        placeOfPerformanceSubdivision: data.placeOfPerformanceSubdivisions?.[i],
        placeOfPerformanceCity: data.placeOfPerformanceCities?.[i],

        awardCriteria: {
          type: data.awardCriterionTypes?.[i],
          description: data.awardCriterionDescriptions?.[i],
          weight: data.awardCriterionNumbers?.[i] ?? null,
          weightCode: data.awardCriterionNumberWeights?.[i],
        },
        selectionCriteria: {
          name: data.selectionCriterionNames?.[i],
          description: data.selectionCriterionDescriptions?.[i],
        },
      };
    }).filter((l) => !!l.identifier);
  }

  normalizeTedNotice(notice: TedNotice): NormalizedTenderDto {
    const lots = this.normalizeTenderLotsNotice(notice);
    const frameworkData = this.normalizeFrameworkFromTEDNotice(notice);

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

      deadline: getDateValue('deadline', notice),
      deadlineReceiptRequest: getDateValue('deadline-receipt-request', notice),

      legalBasis: getStringValue('legal-basis', notice),
      legalBasisProc: getStringValue('legal-basis-proc', notice),
      legalBasisNotice: getStringValue('legal-basis-notice', notice),

      contractNatureMainProc: getStringValue(
        'contract-nature-main-proc',
        notice,
      ) as TedContractNature,
      contractNature: getStringValue(
        'contract-nature',
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

      noticeLanguage: getStringValue('official-language', notice),
      submissionLanguages: getUniqArray('submission-language', notice),
    };

    const lotsCodes: string[] = lots.flatMap(
      ({ mainClassification, additionalClassifications }) => {
        return [
          ...(mainClassification ?? []),
          ...(additionalClassifications ?? []),
        ];
      },
    );

    return {
      id: data.id,
      title:
        this.toOptionalText(data.title) ?? this.toOptionalText(data.titleProc),
      description: this.toOptionalText(data.description),
      noticeType: data.noticeType,
      noticeSubtype: this.toOptionalText(data.noticeSubtype),
      noticeVersion: this.toOptionalText(data.noticeVersion),
      procedureType: data.procedureType,
      publicationDate: data.publicationDate,
      dispatchDate: data.dispatchDate,
      contractNature: this.toOptionalText(
        data.contractNatureMainProc || data.contractNature,
      ),
      legalBasis: this.toOptionalText(
        data.legalBasisProc || data.legalBasisNotice || data.legalBasis,
      ),

      noticeLanguage: data.noticeLanguage,
      submissionLanguages: data.submissionLanguages,

      plannedEndDate: getLatestDate(lots.map((lot) => lot.plannedEndDate)),
      plannedStartDate: getEarliestDate(
        lots.map((lot) => lot.plannedStartDate),
      ),

      questionsDeadline: getEarliestDate(
        lots
          .map((lot) => lot.questionsDeadline)
          .filter((date): date is Date => date !== undefined),
      ),

      duration: getCommonArrayValue(lots.map((l) => l.duration)),
      electronicSubmission: getCommonArrayValue(
        lots.map((l) => l.electronicSubmission),
      ),

      isDps: lots.some((l) => l.isDps),
      isSmeSuitable: getCommonArrayValue(lots.map((l) => l.isSME)),

      mainClassificationProc: data.mainClassificationProc,

      documentUrls: getUniqArray(lots.flatMap((l) => l.documentUrls)),
      submissionUrls: getUniqArray(lots.flatMap((l) => l.submissionUrls)),

      euFundLot: lots.some((lot) => lot.isEuFunded === true)
        ? true
        : lots.some((lot) => lot.isEuFunded === false)
          ? false
          : undefined,

      selectionCriteria: lots
        .map((l) => ({
          identifier: l.identifier,
          name: l.selectionCriteria?.name,
          description: l.selectionCriteria?.description,
        }))
        .filter((criteria) => criteria.name || criteria.description),
      awardCriteria: lots
        .map((l) => ({
          identifier: l.identifier,
          type: l.awardCriteria?.type,
          description: l.awardCriteria?.description,
          weight: l.awardCriteria?.weight,
        }))
        .filter(
          (criteria) =>
            criteria.type || criteria.description || criteria.weight,
        ),

      submissionDeadline:
        data.deadline ??
        data.deadlineReceiptRequest ??
        getEarliestDate(
          lots
            .map((lot) => lot.deadlineReceiptTender)
            .filter((date): date is Date => date !== undefined),
        ) ??
        null,

      estimatedValue: this.getMoneyValueFromNotice(
        [
          'estimated-value-proc',
          'estimated-value-glo',
          'estimated-value-part',
          'total-value',
        ],
        [
          'estimated-value-cur-proc',
          'estimated-value-cur-glo',
          'estimated-value-cur-part',
          'total-value-cur',
        ],
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
      lots,

      links: data.links,

      placeOfPerformanceCities: getUniqArray(
        data.placeOfPerformanceCitiesProc,
        lots.map((l) => l.placeOfPerformanceCity),
      ),
      placeOfPerformanceCountries: getUniqArray(
        data.placeOfPerformanceCountriesProc,
        lots.map((l) => l.placeOfPerformanceCountry),
      ),
      placeOfPerformanceSubdivisions: getUniqArray(
        lots.map((l) => l.placeOfPerformanceSubdivision),
      ),
    };
  }

  getMoneyValueFromNotice(
    amountFields: string[],
    curFields: string[],
    notice: TedNotice,
  ): { amount: MoneyValue; currency: string | null } {
    const amountField = amountFields.find((f) => {
      const rawValue = getArrayValue(f, notice).find(
        (value) => value !== undefined && value !== null && value !== '',
      );

      if (rawValue === undefined) {
        return false;
      }

      const amount = getNumberValue(f, notice);

      return typeof amount === 'number' && !Number.isNaN(amount) && amount >= 0;
    });

    const curField =
      curFields.find((f) => {
        return getStringValue(f, notice);
      }) ?? null;

    return {
      amount: amountField ? getNumberValue(amountField, notice) : null,
      currency: curField ? getStringValue(curField, notice) : null,
    };
  }

  private toOptionalText(value: unknown): string | undefined {
    if (Array.isArray(value)) {
      return this.toOptionalText(value[0]);
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : undefined;
  }
}
