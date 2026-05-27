import { Injectable } from '@nestjs/common';
import {
  fillClassificationCpvByCodes,
  tenderNormilizer,
} from '../ted-search/utils';
import { TedNotice } from '../ted-search/types/ted-search.types';
import { TenderDto } from './dto/tender.dto';
import { extractPublicationNumberFromNotice, isRecord } from '@/utils';
import {
  extractFirstXmlChildTextByParent,
  extractXmlAwardCriteria,
  extractXmlChildTextsByParent,
  extractXmlCpvCodes,
  extractXmlDeadlinePeriod,
  extractXmlDescriptionCandidates,
  extractXmlEstimatedValue,
  extractXmlPlannedDates,
  extractXmlQuestionsDeadline,
  extractXmlSubmissionLanguages,
  extractXmlSubmissionMethod,
  extractXmlUrlsByAncestor,
  fetchXmlContentFromUrl,
  findXmlUrl,
  EstimatedValueCandidate,
  TextCandidate,
} from './tender-normalizer-xml';

export type NormalizedTenderDto = Omit<TenderDto, '_id'>;

@Injectable()
export class TenderNormalizerService {
  async normalizeTedNoticeWithCpvCodes(
    rawNotice: TedNotice,
    rawIds = false,
    normalizedTender = this.normalizeTedNotice(rawNotice),
  ): Promise<NormalizedTenderDto> {
    const {
      classificationCpv,
      mainClassificationProc,
      mainClassificationLot,
      additionalClassificationLot,
    } = await fillClassificationCpvByCodes(tenderNormilizer(normalizedTender));

    return {
      ...normalizedTender,
      classificationCpv: rawIds
        ? (classificationCpv?.map((category) => category._id) ?? [])
        : classificationCpv,
      mainClassificationProc: rawIds
        ? (mainClassificationProc?.map((category) => category._id) ?? [])
        : mainClassificationProc,
      mainClassificationLot: rawIds
        ? (mainClassificationLot?.map((category) => category._id) ?? [])
        : mainClassificationLot,
      additionalClassificationLot: rawIds
        ? (additionalClassificationLot?.map((category) => category._id) ?? [])
        : additionalClassificationLot,
    };
  }

  normalizeTedNotice(rawNotice: TedNotice): NormalizedTenderDto {
    const publicationNumber =
      extractPublicationNumberFromNotice(rawNotice) ??
      this.pickText(rawNotice, ['publicationNumber']);
    const estimatedValue = this.pickEstimatedValue(rawNotice);
    const titleProc = this.pickText(rawNotice, ['title-proc', 'titleProc']);
    const titleLot = this.pickTextArray(rawNotice, ['title-lot', 'titleLot']);
    const description =
      this.pickLocalizedText(rawNotice['description-proc']) ??
      this.pickLocalizedText(rawNotice.descriptionProc);
    const descriptionLot = this.pickTextArray(rawNotice, [
      'description-lot',
      'descriptionLot',
    ]);

    const dto: NormalizedTenderDto = {
      id: publicationNumber ?? this.createFallbackId(rawNotice),
      sourceNoticeId: this.pickText(rawNotice, [
        'notice-identifier',
        'noticeIdentifier',
      ]),
      publicationNumber,
      noticeType: this.pickText(rawNotice, ['notice-type', 'noticeType']),
      noticeSubtype: this.pickText(rawNotice, [
        'notice-subtype',
        'noticeSubtype',
      ]),
      noticeVersion: this.pickText(rawNotice, [
        'notice-version',
        'noticeVersion',
      ]),
      procedureType: this.pickText(rawNotice, [
        'procedure-type',
        'procedureType',
      ]),
      title:
        this.pickText(rawNotice, ['notice-title', 'noticeTitle', 'title']) ??
        titleProc ??
        titleLot?.[0],
      titleProc,
      titleLot,
      description,
      descriptionLot,
      estimatedValue,
      noticeLanguage: this.pickText(rawNotice, [
        'official-language',
        'officialLanguage',
      ]),
      submissionLanguages: this.pickTextArray(rawNotice, [
        'submission-language',
        'submissionLanguage',
      ]),
      buyerName: this.pickText(rawNotice, [
        'buyer-name',
        'buyerName',
        'organisation-name-buyer',
        'organisationNameBuyer',
      ]),
      buyerIdentifier: this.pickText(rawNotice, [
        'buyer-identifier',
        'buyerIdentifier',
        'organisation-identifier-buyer',
        'organisationIdentifierBuyer',
      ]),
      buyerCountry: this.pickText(rawNotice, [
        'buyer-country',
        'buyerCountry',
        'organisation-country-buyer',
        'organisationCountryBuyer',
      ]),
      buyerCity: this.pickText(rawNotice, [
        'buyer-city',
        'buyerCity',
        'organisation-city-buyer',
        'organisationCityBuyer',
      ]),
      buyerMainActivities: this.pickTextArray(rawNotice, [
        'main-activity',
        'mainActivity',
        'authority-main-activity',
        'authorityMainActivity',
        'entity-main-activity',
        'entityMainActivity',
      ]),
      buyerEmail: this.pickText(rawNotice, [
        'buyer-email',
        'buyerEmail',
        'organisation-email-buyer',
        'organisationEmailBuyer',
      ]),
      buyerInternetAddress: this.pickText(rawNotice, [
        'buyer-internet-address',
        'buyerInternetAddress',
        'organisation-internet-address-buyer',
        'organisationInternetAddressBuyer',
      ]),
      buyerProfile: this.pickText(rawNotice, ['buyer-profile', 'buyerProfile']),
      publicationDate: this.parseTenderDate(
        this.pickText(rawNotice, ['publication-date', 'publicationDate']),
      ),
      dispatchDate: this.parseTenderDate(
        this.pickText(rawNotice, ['dispatch-date', 'dispatchDate']),
      ),
      submissionDeadline:
        this.parseTenderDate(
          this.pickText(rawNotice, ['deadline-receipt-request']),
        ) ??
        this.parseTenderDate(
          this.pickDateTime(
            rawNotice,
            [
              'deadline-receipt-tender-date-lot',
              'deadlineReceiptTenderDateLot',
            ],
            [
              'deadline-receipt-tender-time-lot',
              'deadlineReceiptTenderTimeLot',
            ],
          ),
        ) ??
        this.parseTenderDate(
          this.pickText(rawNotice, ['deadline', 'deadlineDate']),
        ),
      deadlineReceiptTender: this.parseTenderDate(
        this.pickDateTime(
          rawNotice,
          ['deadline-receipt-tender-date-lot', 'deadlineReceiptTenderDateLot'],
          ['deadline-receipt-tender-time-lot', 'deadlineReceiptTenderTimeLot'],
        ),
      ),
      questionsDeadline: this.parseTenderDate(
        this.pickDateTime(
          rawNotice,
          [
            'deadline-receipt-answers-date-lot',
            'deadlineReceiptAnswersDateLot',
          ],
          [
            'deadline-receipt-answers-time-lot',
            'deadlineReceiptAnswersTimeLot',
          ],
        ),
      ),
      plannedStartDate: this.parseTenderDate(
        this.pickEarliestText(rawNotice, [
          'contract-duration-start-date-lot',
          'contractDurationStartDateLot',
        ]),
      ),
      plannedEndDate: this.parseTenderDate(
        this.pickLatestText(rawNotice, [
          'contract-duration-end-date-lot',
          'contractDurationEndDateLot',
        ]),
      ),
      durationPeriodValue: this.pickText(rawNotice, [
        'duration-period-value-lot',
        'durationPeriodValueLot',
      ]),
      durationPeriodUnit: this.pickText(rawNotice, [
        'duration-period-unit-lot',
        'durationPeriodUnitLot',
      ]),
      contractNature: this.pickText(rawNotice, [
        'contract-nature',
        'contractNature',
        'contract-nature-main-proc',
        'contractNatureMainProc',
        'contract-nature-main-lot',
        'contractNatureMainLot',
        'contract-nature-main-part',
        'contractNatureMainPart',
      ]),
      legalBasis: this.pickText(rawNotice, [
        'legal-basis',
        'legalBasis',
        'legal-basis-proc',
        'legalBasisProc',
        'legal-basis-notice',
        'legalBasisNotice',
      ]),
      isDps: this.systemCodeFlagFromValue(
        rawNotice['dps-usage-lot'] ?? rawNotice.dpsUsageLot,
      ),
      isFrameworkAgreement: this.systemCodeFlagFromValue(
        rawNotice['framework-agreement-lot'] ?? rawNotice.frameworkAgreementLot,
      ),
      isSmeSuitable: this.booleanFromValue(
        rawNotice['sme-lot'] ?? rawNotice.smeLot,
      ),
      electronicSubmission: this.pickText(rawNotice, [
        'electronic-submission-lot',
        'electronicSubmissionLot',
      ]),
      mainClassificationProc: this.pickTextArray(rawNotice, [
        'main-classification-proc',
        'mainClassificationProc',
      ]) as TenderDto['mainClassificationProc'],
      mainClassificationLot: this.pickTextArray(rawNotice, [
        'main-classification-lot',
        'mainClassificationLot',
      ]) as TenderDto['mainClassificationLot'],
      additionalClassificationLot: this.pickTextArray(rawNotice, [
        'additional-classification-lot',
        'additionalClassificationLot',
      ]) as TenderDto['additionalClassificationLot'],
      placeOfPerformanceCountries: this.pickTextArray(rawNotice, [
        'place-of-performance-country-proc',
        'placeOfPerformanceCountryProc',
        'place-of-performance-country-lot',
        'placeOfPerformanceCountryLot',
      ]),
      placeOfPerformanceCities: this.pickTextArray(rawNotice, [
        'place-of-performance-city-proc',
        'placeOfPerformanceCityProc',
        'place-of-performance-city-lot',
        'placeOfPerformanceCityLot',
      ]),
      lotIdentifiers: this.pickTextArray(rawNotice, [
        'identifier-lot',
        'identifierLot',
      ]),
      internalLotIdentifiers: this.pickTextArray(rawNotice, [
        'internal-identifier-lot',
        'internalIdentifierLot',
      ]),
      documentUrls: this.pickTextArray(rawNotice, [
        'document-url-lot',
        'documentUrlLot',
      ]),
      submissionUrls: this.pickTextArray(rawNotice, [
        'submission-url-lot',
        'submissionUrlLot',
      ]),
      euFundLot: this.booleanFromValue(
        rawNotice['eu-fund-lot'] ?? rawNotice.euFundLot,
      ),
      selectionCriteria: this.pickCriteria(
        rawNotice,
        ['selection-criterion-name-lot', 'selectionCriterionNameLot'],
        [
          'selection-criterion-description-lot',
          'selectionCriterionDescriptionLot',
        ],
      ),
      awardCriteria: this.pickAwardCriteria(rawNotice),
      classificationCpv: Array.from(
        new Set(
          this.pickArray(rawNotice, [
            'classification-cpv',
            'classificationCpv',
          ]),
        ),
      ) as TenderDto['classificationCpv'],
      cpvCodes: Array.from(
        new Set([
          ...(this.pickTextArray(rawNotice, ['classification-cpv']) ?? []),
          ...(this.pickTextArray(rawNotice, ['classificationCpv']) ?? []),
          ...(this.pickTextArray(rawNotice, [
            'main-classification-proc',
            'mainClassificationProc',
          ]) ?? []),
          ...(this.pickTextArray(rawNotice, [
            'main-classification-lot',
            'mainClassificationLot',
          ]) ?? []),
          ...(this.pickTextArray(rawNotice, [
            'additional-classification-lot',
            'additionalClassificationLot',
          ]) ?? []),
        ]),
      ) as TenderDto['cpvCodes'],
      links: rawNotice.links,
    };

    return dto;
  }

  private applyXmlFallbacks(
    dto: NormalizedTenderDto,
    xml?: string,
  ): NormalizedTenderDto {
    if (xml === undefined) {
      return dto;
    }

    const titleProc = extractFirstXmlChildTextByParent(
      xml,
      'ProcurementProject',
      'Name',
    );
    const titleLot = extractXmlChildTextsByParent(
      xml,
      'ProcurementProjectLot',
      'Name',
    );
    const descriptions = extractXmlDescriptionCandidates(xml).map(
      (candidate) => candidate.text,
    );
    const estimatedValue = extractXmlEstimatedValue(xml);
    const submissionDeadline = this.parseTenderDate(
      extractXmlDeadlinePeriod(xml, 'TenderSubmissionDeadlinePeriod'),
    );
    const questionsDeadline = this.parseTenderDate(
      extractXmlQuestionsDeadline(xml),
    );
    const plannedStartDate = this.parseTenderDate(
      this.pickSortedValue(extractXmlPlannedDates(xml, 'StartDate'), 'asc'),
    );
    const plannedEndDate = this.parseTenderDate(
      this.pickSortedValue(extractXmlPlannedDates(xml, 'EndDate'), 'desc'),
    );
    const submissionLanguages = extractXmlSubmissionLanguages(xml);
    const cpvCodes = extractXmlCpvCodes(xml);
    const documentUrls = extractXmlUrlsByAncestor(xml, [
      'TenderingTerms',
      'CallForTendersDocumentReference',
      'AdditionalDocumentReference',
    ]);
    const submissionUrls = extractXmlUrlsByAncestor(xml, [
      'TenderSubmission',
      'TenderSubmissionDeadlinePeriod',
      'SubmissionMethodDetails',
    ]);
    const awardCriteria = extractXmlAwardCriteria(xml);

    return {
      ...dto,
      title: dto.title ?? titleProc ?? titleLot[0],
      titleProc: dto.titleProc ?? titleProc,
      titleLot: this.mergeTextArrays(dto.titleLot, titleLot),
      description: dto.description ?? descriptions[0],
      descriptionLot: this.mergeTextArrays(dto.descriptionLot, descriptions),
      estimatedValue: dto.estimatedValue ?? estimatedValue,
      submissionDeadline: submissionDeadline ?? dto.submissionDeadline,
      deadlineReceiptTender: submissionDeadline ?? dto.deadlineReceiptTender,
      questionsDeadline: questionsDeadline ?? dto.questionsDeadline,
      plannedStartDate: plannedStartDate ?? dto.plannedStartDate,
      plannedEndDate: plannedEndDate ?? dto.plannedEndDate,
      submissionLanguages: this.mergeTextArrays(
        dto.submissionLanguages,
        submissionLanguages,
      ),
      electronicSubmission:
        dto.electronicSubmission ?? extractXmlSubmissionMethod(xml),
      documentUrls: this.mergeTextArrays(dto.documentUrls, documentUrls),
      submissionUrls: this.mergeTextArrays(dto.submissionUrls, submissionUrls),
      awardCriteria:
        awardCriteria.length > 0 ? awardCriteria : dto.awardCriteria,
      cpvCodes: this.mergeTextArrays(
        dto.cpvCodes as string[] | undefined,
        cpvCodes,
      ) as TenderDto['cpvCodes'],
      classificationCpv: this.mergeTextArrays(
        dto.classificationCpv as string[] | undefined,
        cpvCodes,
      ) as TenderDto['classificationCpv'],
      mainClassificationProc: this.mergeTextArrays(
        dto.mainClassificationProc as string[] | undefined,
        cpvCodes,
      ) as TenderDto['mainClassificationProc'],
    };
  }

  private async fetchXmlContentFromNotice(
    rawNotice: TedNotice,
  ): Promise<string> {
    const sourceUrl = findXmlUrl(rawNotice.links);

    try {
      const content = await fetchXmlContentFromUrl(sourceUrl);

      return content ?? '';
    } catch {
      return '';
    }
  }

  private pickText(
    raw: Record<string, unknown>,
    paths: string[],
  ): string | undefined {
    for (const path of paths) {
      const text = this.valueToText(raw[path]);

      if (text !== undefined && text.trim().length > 0) {
        return text.trim();
      }
    }

    return undefined;
  }

  private pickArray(raw: Record<string, unknown>, paths: string[]): unknown[] {
    for (const path of paths) {
      const value = raw[path];

      if (Array.isArray(value)) {
        return value;
      }
    }

    return [];
  }

  private pickTextArray(
    raw: Record<string, unknown>,
    paths: string[],
  ): string[] | undefined {
    const values: string[] = [];

    for (const path of paths) {
      this.collectTextValues(raw[path], values);
    }

    const uniqueValues = Array.from(
      new Set(values.map((value) => value.trim()).filter(Boolean)),
    );

    return uniqueValues.length > 0 ? uniqueValues : undefined;
  }

  private pickLocalizedText(
    value: unknown,
    noticeLanguage?: string,
  ): string | undefined {
    const candidates: TextCandidate[] = [];
    this.collectTextCandidates(value, candidates);

    return this.selectLocalizedText(candidates, noticeLanguage);
  }

  private collectTextValues(value: unknown, values: string[]): void {
    if (value === undefined || value === null) {
      return;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      values.push(String(value));
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectTextValues(item, values);
      }

      return;
    }

    if (isRecord(value)) {
      const directText = this.valueToText(value);

      if (directText !== undefined) {
        values.push(directText);
      }
    }
  }

  private pickDateTime(
    raw: Record<string, unknown>,
    datePaths: string[],
    timePaths: string[],
  ): string | undefined {
    return this.combineDateAndTime(
      this.pickEarliestText(raw, datePaths),
      this.pickText(raw, timePaths),
    );
  }

  private parseTenderDate(value: string | undefined): Date | undefined {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return undefined;
    }

    if (/^\d{8}$/.test(trimmed)) {
      return this.toValidDate(
        `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T00:00:00.000Z`,
      );
    }

    const normalized = this.normalizeTenderDateText(trimmed);

    if (normalized) {
      return this.toValidDate(normalized);
    }

    return this.toValidDate(trimmed);
  }

  private normalizeTenderDateText(value: string): string | undefined {
    const match = value.match(
      /^(\d{4}-\d{2}-\d{2})(Z|[+-]\d{2}:\d{2})?(?:T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)(Z|[+-]\d{2}:\d{2})?)?/,
    );

    if (!match) {
      return undefined;
    }

    const date = match[1];
    const dateOffset = match[2];
    const time = this.normalizeTenderTime(match[3], match[4] ?? dateOffset);

    if (time) {
      return `${date}T${time}`;
    }

    return `${date}T00:00:00.000${dateOffset ?? 'Z'}`;
  }

  private normalizeTenderTime(
    value: string | undefined,
    offset?: string,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const [baseTime, fraction] = value.split('.');
    const seconds = baseTime.length === 5 ? `${baseTime}:00` : baseTime;
    const milliseconds = fraction ? fraction.slice(0, 3).padEnd(3, '0') : '000';

    return `${seconds}.${milliseconds}${offset ?? 'Z'}`;
  }

  private toValidDate(value: string): Date | undefined {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private pickEarliestText(
    raw: Record<string, unknown>,
    paths: string[],
  ): string | undefined {
    return this.pickSortedText(raw, paths, 'asc');
  }

  private pickLatestText(
    raw: Record<string, unknown>,
    paths: string[],
  ): string | undefined {
    return this.pickSortedText(raw, paths, 'desc');
  }

  private pickSortedText(
    raw: Record<string, unknown>,
    paths: string[],
    sort: 'asc' | 'desc',
  ): string | undefined {
    const values = this.pickTextArray(raw, paths)?.sort() ?? [];

    return sort === 'asc' ? values[0] : values[values.length - 1];
  }

  private pickSortedValue(
    values: string[],
    sort: 'asc' | 'desc',
  ): string | undefined {
    const sorted = this.uniqueNonEmptyText(values).sort();

    return sort === 'asc' ? sorted[0] : sorted[sorted.length - 1];
  }

  private pickEstimatedValue(
    raw: Record<string, unknown>,
  ): TenderDto['estimatedValue'] {
    const candidates = [
      [
        ['estimated-value-proc', 'estimatedValueProc'],
        ['estimated-value-cur-proc', 'estimatedValueCurProc'],
      ],
      [
        ['estimated-value-lot', 'estimatedValueLot'],
        ['estimated-value-cur-lot', 'estimatedValueCurLot'],
      ],
      [
        ['estimated-value-glo', 'estimatedValueGlo'],
        ['estimated-value-cur-glo', 'estimatedValueCurGlo'],
      ],
      [
        ['estimated-value-part', 'estimatedValuePart'],
        ['estimated-value-cur-part', 'estimatedValueCurPart'],
      ],
      [
        ['total-value', 'totalValue'],
        ['total-value-cur', 'totalValueCur'],
      ],
    ] as const;

    for (const [amountPaths, currencyPaths] of candidates) {
      const amount = this.numberFromValue(this.pickText(raw, [...amountPaths]));
      const currency = this.pickText(raw, [...currencyPaths]);

      if (!!amount || currency) {
        return {
          amount: this.normalizeEstimatedAmount(amount),
          currency: currency ?? null,
        };
      }
    }

    return undefined;
  }

  private normalizeEstimatedAmount(amount: number | undefined): number | null {
    return amount && amount > 0 ? amount : null;
  }

  private pickCriteria(
    raw: Record<string, unknown>,
    namePaths: string[],
    descriptionPaths: string[],
  ): Array<{ name?: string; description?: string }> | undefined {
    const names = this.pickTextArray(raw, namePaths) ?? [];
    const descriptions = this.pickTextArray(raw, descriptionPaths) ?? [];
    const length = Math.max(names.length, descriptions.length);

    if (length === 0) {
      return undefined;
    }

    return Array.from({ length }, (_, index) => ({
      name: names[index],
      description: descriptions[index],
    }));
  }

  private pickAwardCriteria(raw: Record<string, unknown>):
    | Array<{
        name?: string;
        description?: string;
        type?: string;
        weight?: string;
      }>
    | undefined {
    const names =
      this.pickTextArray(raw, [
        'award-criterion-name-lot',
        'awardCriterionNameLot',
      ]) ?? [];
    const descriptions =
      this.pickTextArray(raw, [
        'award-criterion-description-lot',
        'awardCriterionDescriptionLot',
      ]) ?? [];
    const types =
      this.pickTextArray(raw, [
        'award-criterion-type-lot',
        'awardCriterionTypeLot',
      ]) ?? [];
    const weights =
      this.pickTextArray(raw, [
        'award-criterion-number-weight-lot',
        'awardCriterionNumberWeightLot',
      ]) ?? [];
    const length = Math.max(
      names.length,
      descriptions.length,
      types.length,
      weights.length,
    );

    if (length === 0) {
      return undefined;
    }

    return Array.from({ length }, (_, index) => ({
      name: names[index],
      description: descriptions[index],
      type: types[index],
      weight: weights[index],
    }));
  }

  private valueToText(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const text = this.valueToText(item);

        if (text !== undefined && text.trim().length > 0) {
          return text;
        }
      }
    }

    if (isRecord(value)) {
      for (const key of ['ENG', 'eng', 'EN', 'en', 'value', 'text']) {
        const text = this.valueToText(value[key]);

        if (text !== undefined && text.trim().length > 0) {
          return text;
        }
      }

      for (const nestedValue of Object.values(value)) {
        const text = this.valueToText(nestedValue);

        if (text !== undefined && text.trim().length > 0) {
          return text;
        }
      }
    }

    return undefined;
  }

  private collectTextCandidates(
    value: unknown,
    candidates: TextCandidate[],
    inheritedLanguage?: string,
  ): void {
    if (value === undefined || value === null) {
      return;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      candidates.push({
        text: String(value).trim(),
        language: inheritedLanguage,
      });
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectTextCandidates(item, candidates, inheritedLanguage);
      }

      return;
    }

    if (!isRecord(value)) {
      return;
    }

    const language = this.getLanguage(value) ?? inheritedLanguage;

    for (const key of ['#text', '_', '$text', 'value', 'text']) {
      const text = this.valueToText(value[key]);

      if (text !== undefined && text.trim().length > 0) {
        candidates.push({ text: text.trim(), language });
      }
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (this.isLanguageCodeKey(key)) {
        this.collectTextCandidates(nestedValue, candidates, key);
      }
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (this.isMetadataKey(key) || this.isLanguageCodeKey(key)) {
        continue;
      }

      this.collectTextCandidates(nestedValue, candidates, language);
    }
  }

  private selectLocalizedText(
    candidates: TextCandidate[],
    noticeLanguage?: string,
  ): string | undefined {
    const nonEmpty = candidates.filter(
      (candidate) => candidate.text.length > 0,
    );

    return (
      this.findCandidateByLanguage(nonEmpty, 'ENG') ??
      this.findCandidateByLanguage(nonEmpty, noticeLanguage) ??
      nonEmpty[0]?.text
    );
  }

  private findCandidateByLanguage(
    candidates: TextCandidate[],
    language?: string,
  ): string | undefined {
    if (language === undefined) {
      return undefined;
    }

    const normalized = language.trim().toUpperCase();

    return candidates.find(
      (candidate) => candidate.language?.trim().toUpperCase() === normalized,
    )?.text;
  }

  private numberFromValue(value: unknown): number | undefined {
    const text = this.valueToText(value)?.replace(/\s/g, '').replace(',', '.');

    if (text === undefined || text.length === 0) {
      return undefined;
    }

    const parsed = Number(text);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private booleanFromValue(value: unknown): boolean | undefined {
    const text = this.valueToText(value)?.trim().toLowerCase();

    if (text === undefined || text.length === 0) {
      return undefined;
    }

    if (['true', '1', 'yes', 'y'].includes(text)) {
      return true;
    }

    if (['false', '0', 'no', 'n', 'none', 'not-allowed'].includes(text)) {
      return false;
    }

    return undefined;
  }

  private systemCodeFlagFromValue(value: unknown): boolean | undefined {
    const parsedBoolean = this.booleanFromValue(value);

    if (parsedBoolean !== undefined) {
      return parsedBoolean;
    }

    const text = this.valueToText(value)?.trim().toLowerCase();

    if (text === undefined || text.length === 0) {
      return undefined;
    }

    return text !== 'none';
  }

  private combineDateAndTime(
    date: string | undefined,
    time: string | undefined,
  ): string | undefined {
    if (date === undefined) {
      return undefined;
    }

    if (time === undefined) {
      return date;
    }

    return `${date}T${time}`;
  }

  private uniqueNonEmptyText(values: unknown[]): string[] {
    return Array.from(
      new Set(
        values
          .map((value) => this.valueToText(value)?.trim())
          .filter(
            (value): value is string => value !== undefined && value.length > 0,
          ),
      ),
    );
  }

  private getLanguage(record: Record<string, unknown>): string | undefined {
    return this.valueToText(
      record.languageID ??
        record.languageId ??
        record.language ??
        record.locale ??
        record['@languageID'] ??
        record['@_languageID'] ??
        record['@xml:lang'] ??
        record['@_xml:lang'] ??
        record['xml:lang'],
    );
  }

  private getListName(record: Record<string, unknown>): string | undefined {
    return this.valueToText(
      record.listName ?? record['@listName'] ?? record['@_listName'],
    );
  }

  private getLocalName(key: string): string {
    const withoutAttributePrefix = key.replace(/^@_?/, '');
    const parts = withoutAttributePrefix.split(':');

    return parts[parts.length - 1];
  }

  private isLanguageCodeKey(key: string): boolean {
    return /^[A-Za-z]{2,3}$/.test(key);
  }

  private isMetadataKey(key: string): boolean {
    return key.startsWith('@') || key === '$' || key === 'attributes';
  }

  private mergeTextArrays(
    primary?: unknown[],
    fallback?: unknown[],
  ): string[] | undefined {
    const values = this.uniqueNonEmptyText([
      ...(primary ?? []),
      ...(fallback ?? []),
    ]);

    return values.length > 0 ? values : undefined;
  }

  private createFallbackId(rawNotice: TedNotice): string {
    const text = JSON.stringify(rawNotice);
    let hash = 0;

    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }

    return hash.toString(16);
  }
}
