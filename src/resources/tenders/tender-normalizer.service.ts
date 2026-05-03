import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { isTag, type AnyNode, type Element } from 'domhandler';
import {
  fillClassificationCpvByCodes,
  tenderNormilizer,
} from '../ted-search/utils';
import { TedNotice } from '../ted-search/types/ted-search.types';
import { TenderDto } from './dto/tender.dto';
import { extractPublicationNumberFromNotice, isRecord } from '@/utils';

interface TextCandidate {
  text: string;
  language?: string;
}

interface EstimatedValueCandidate {
  amount: number | null;
  currency: string | null;
}

@Injectable()
export class TenderNormalizerService {
  async normalizeTedNoticeWithCpvCodes(
    rawNotice: TedNotice,
    rawIds = false,
  ): Promise<TenderDto> {
    const { classificationCpv } = await fillClassificationCpvByCodes(
      tenderNormilizer(rawNotice),
    );

    return {
      ...this.normalizeTedNotice(rawNotice),
      classificationCpv: rawIds
        ? classificationCpv.map((category) => category._id)
        : classificationCpv,
    };
  }

  normalizeTedNotice(rawNotice: TedNotice): TenderDto {
    const publicationNumber =
      extractPublicationNumberFromNotice(rawNotice) ??
      this.pickText(rawNotice, ['publicationNumber']);
    const estimatedValue = this.pickEstimatedValue(rawNotice);
    const titleProc = this.pickText(rawNotice, ['title-proc', 'titleProc']);
    const titleLot = this.pickTextArray(rawNotice, ['title-lot', 'titleLot']);
    const description =
      this.pickLocalizedText(rawNotice['description-proc']) ??
      this.pickLocalizedText(rawNotice.descriptionProc) ??
      this.pickLocalizedText(rawNotice['description-lot']) ??
      this.pickLocalizedText(rawNotice.descriptionLot);
    const descriptionLot = this.pickTextArray(rawNotice, [
      'description-lot',
      'descriptionLot',
    ]);

    const dto: TenderDto = {
      id: publicationNumber ?? this.createFallbackId(rawNotice),
      source: 'TED',
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
      buyerName: this.pickText(rawNotice, ['buyer-name', 'buyerName']),
      buyerIdentifier: this.pickText(rawNotice, [
        'buyer-identifier',
        'buyerIdentifier',
      ]),
      buyerCountry: this.pickText(rawNotice, ['buyer-country', 'buyerCountry']),
      buyerCity: this.pickText(rawNotice, ['buyer-city', 'buyerCity']),
      buyerEmail: this.pickText(rawNotice, ['buyer-email', 'buyerEmail']),
      buyerInternetAddress: this.pickText(rawNotice, [
        'buyer-internet-address',
        'buyerInternetAddress',
      ]),
      buyerProfile: this.pickText(rawNotice, ['buyer-profile', 'buyerProfile']),
      publicationDate: this.pickText(rawNotice, [
        'publication-date',
        'publicationDate',
      ]),
      dispatchDate: this.pickText(rawNotice, ['dispatch-date', 'dispatchDate']),
      submissionDeadline:
        this.pickText(rawNotice, ['deadline']) ??
        this.pickDateTime(
          rawNotice,
          ['deadline-receipt-tender-date-lot', 'deadlineReceiptTenderDateLot'],
          ['deadline-receipt-tender-time-lot', 'deadlineReceiptTenderTimeLot'],
        ),
      deadlineReceiptTender: this.pickDateTime(
        rawNotice,
        ['deadline-receipt-tender-date-lot', 'deadlineReceiptTenderDateLot'],
        ['deadline-receipt-tender-time-lot', 'deadlineReceiptTenderTimeLot'],
      ),
      questionsDeadline: this.pickDateTime(
        rawNotice,
        ['deadline-receipt-answers-date-lot', 'deadlineReceiptAnswersDateLot'],
        ['deadline-receipt-answers-time-lot', 'deadlineReceiptAnswersTimeLot'],
      ),
      plannedStartDate: this.pickEarliestText(rawNotice, [
        'contract-duration-start-date-lot',
        'contractDurationStartDateLot',
      ]),
      plannedEndDate: this.pickLatestText(rawNotice, [
        'contract-duration-end-date-lot',
        'contractDurationEndDateLot',
      ]),
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
      ]),
      legalBasis: this.pickText(rawNotice, ['legal-basis', 'legalBasis']),
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
      ]),
      mainClassificationLot: this.pickTextArray(rawNotice, [
        'main-classification-lot',
        'mainClassificationLot',
      ]),
      additionalClassificationLot: this.pickTextArray(rawNotice, [
        'additional-classification-lot',
        'additionalClassificationLot',
      ]),
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
          ...(this.pickTextArray(rawNotice, ['main-classification-proc']) ??
            []),
          ...(this.pickTextArray(rawNotice, ['main-classification-lot']) ?? []),
          ...(this.pickTextArray(rawNotice, [
            'additional-classification-lot',
          ]) ?? []),
        ]),
      ) as TenderDto['cpvCodes'],
      links: rawNotice.links,
    };

    return dto;
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

  private pickEstimatedValue(
    raw: Record<string, unknown>,
  ): TenderDto['estimatedValue'] {
    const procAmount = this.numberFromValue(
      raw['estimated-value-proc'] ?? raw.estimatedValueProc,
    );
    const procCurrency = this.valueToText(
      raw['estimated-value-cur-proc'] ?? raw.estimatedValueCurProc,
    );

    if (procAmount !== undefined || procCurrency !== undefined) {
      return {
        amount: procAmount ?? null,
        currency: procCurrency ?? null,
      };
    }

    const lotAmount = this.numberFromValue(
      raw['estimated-value-lot'] ?? raw.estimatedValueLot,
    );
    const lotCurrency = this.valueToText(
      raw['estimated-value-cur-lot'] ?? raw.estimatedValueCurLot,
    );

    if (lotAmount !== undefined || lotCurrency !== undefined) {
      return {
        amount: lotAmount ?? null,
        currency: lotCurrency ?? null,
      };
    }

    return undefined;
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

  private valueToEstimatedValue(
    value: unknown,
  ): EstimatedValueCandidate | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'number' || typeof value === 'string') {
      const amount = this.numberFromValue(value);

      return amount === undefined ? undefined : { amount, currency: null };
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const candidate = this.valueToEstimatedValue(item);

        if (candidate !== undefined) {
          return candidate;
        }
      }
    }

    if (isRecord(value)) {
      const amount =
        this.numberFromValue(value.amount) ??
        this.numberFromValue(value.value) ??
        this.numberFromValue(value['#text']) ??
        this.numberFromValue(value._);

      if (amount === undefined) {
        return undefined;
      }

      return {
        amount,
        currency:
          this.valueToText(
            value.currency ??
              value.currencyID ??
              value.currencyId ??
              value['@currencyID'] ??
              value['@_currencyID'],
          ) ?? null,
      };
    }

    return undefined;
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

  private extractPlannedDate(
    rawNotice: TedNotice,
    localName: 'StartDate' | 'EndDate',
    sort: 'asc' | 'desc',
  ): string | undefined {
    const xml = this.findXmlContent(rawNotice);
    const values =
      xml === undefined ? [] : this.extractXmlPlannedDates(xml, localName);
    const periods = this.collectDeepRecordValuesByLocalName(
      rawNotice,
      'PlannedPeriod',
    );

    for (const period of periods) {
      const value = this.firstDirectText(period, localName);

      if (value !== undefined) {
        values.push(value);
      }
    }

    const sorted = this.uniqueNonEmptyText(values).sort();

    return sort === 'asc' ? sorted[0] : sorted[sorted.length - 1];
  }

  private findContractingSystemCode(
    rawNotice: TedNotice,
    listName: string,
  ): string | undefined {
    const xml = this.findXmlContent(rawNotice);

    if (xml !== undefined) {
      const xmlValue = this.extractXmlContractingSystemCode(xml, listName);

      if (xmlValue !== undefined) {
        return xmlValue;
      }
    }

    for (const value of this.collectDeepValuesByLocalName(
      rawNotice,
      'ContractingSystemTypeCode',
    )) {
      const record = isRecord(value) ? value : undefined;
      const codeListName =
        record === undefined ? undefined : this.getListName(record);

      if (codeListName?.toLowerCase() === listName.toLowerCase()) {
        return this.valueToText(value);
      }
    }

    return undefined;
  }

  private findSubmissionMethod(rawNotice: TedNotice): string | undefined {
    for (const value of this.collectDeepValuesByLocalName(
      rawNotice,
      'SubmissionMethodCode',
    )) {
      const record = isRecord(value) ? value : undefined;
      const listName =
        record === undefined ? undefined : this.getListName(record);

      if (listName?.toLowerCase() === 'esubmission') {
        return this.valueToText(value);
      }
    }

    return undefined;
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

  private firstTextByLocalName(
    value: unknown,
    localName: string,
  ): string | undefined {
    for (const item of this.collectDeepValuesByLocalName(value, localName)) {
      const text = this.valueToText(item);

      if (text !== undefined && text.trim().length > 0) {
        return text.trim();
      }
    }

    return undefined;
  }

  private firstDirectText(
    record: Record<string, unknown>,
    localName: string,
  ): string | undefined {
    for (const value of this.getDirectValuesByLocalName(record, localName)) {
      const text = this.valueToText(value);

      if (text !== undefined && text.trim().length > 0) {
        return text.trim();
      }
    }

    return undefined;
  }

  private collectDeepRecordValuesByLocalName(
    value: unknown,
    localName: string,
  ): Record<string, unknown>[] {
    return this.collectDeepValuesByLocalName(value, localName).filter(
      (item): item is Record<string, unknown> => isRecord(item),
    );
  }

  private collectDeepValuesByLocalName(
    value: unknown,
    localName: string,
  ): unknown[] {
    const values: unknown[] = [];
    this.collectDeepValuesByLocalNameInto(value, localName, values);

    return values;
  }

  private collectDeepValuesByLocalNameInto(
    value: unknown,
    localName: string,
    values: unknown[],
  ): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectDeepValuesByLocalNameInto(item, localName, values);
      }

      return;
    }

    if (!isRecord(value)) {
      return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (this.getLocalName(key).toLowerCase() === localName.toLowerCase()) {
        if (Array.isArray(nestedValue)) {
          values.push(...nestedValue);
        } else {
          values.push(nestedValue);
        }
      }

      this.collectDeepValuesByLocalNameInto(nestedValue, localName, values);
    }
  }

  private getDirectValuesByLocalName(
    record: Record<string, unknown>,
    localName: string,
  ): unknown[] {
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(record)) {
      if (this.getLocalName(key).toLowerCase() !== localName.toLowerCase()) {
        continue;
      }

      if (Array.isArray(value)) {
        values.push(...value);
      } else {
        values.push(value);
      }
    }

    return values;
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

  private getElementLocalName(node: AnyNode): string {
    return isTag(node) ? this.getLocalName(node.tagName) : '';
  }

  private isLanguageCodeKey(key: string): boolean {
    return /^[A-Za-z]{2,3}$/.test(key);
  }

  private isMetadataKey(key: string): boolean {
    return key.startsWith('@') || key === '$' || key === 'attributes';
  }

  private findXmlContent(rawNotice: TedNotice): string | undefined {
    for (const key of ['xmlContent', 'xml', 'content', 'noticeXml']) {
      const value = rawNotice[key];

      if (typeof value === 'string' && value.includes('<')) {
        return value;
      }
    }

    return undefined;
  }

  private extractXmlDescriptionCandidates(xml: string): TextCandidate[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const candidates: TextCandidate[] = [];

    $('*').each((_, element) => {
      if (this.getElementLocalName(element).toLowerCase() !== 'description') {
        return;
      }

      const parent = element.parent;

      if (
        parent === null ||
        !isTag(parent) ||
        this.getElementLocalName(parent).toLowerCase() !== 'procurementproject'
      ) {
        return;
      }

      const text = $(element).text().trim();

      if (text.length === 0) {
        return;
      }

      candidates.push({
        text,
        language:
          this.getXmlAttr($, element, 'languageID') ??
          this.getXmlAttr($, element, 'xml:lang') ??
          this.getXmlAttr($, element, 'lang'),
      });
    });

    return candidates;
  }

  private extractXmlEstimatedValue(
    xml: string,
  ): EstimatedValueCandidate | undefined {
    const $ = cheerio.load(xml, { xmlMode: true });
    const candidates: Array<EstimatedValueCandidate & { priority: number }> =
      [];

    $('*').each((_, element) => {
      if (
        this.getElementLocalName(element).toLowerCase() !==
        'estimatedoverallcontractamount'
      ) {
        return;
      }

      const amount = this.numberFromValue($(element).text());

      if (amount === undefined) {
        return;
      }

      candidates.push({
        amount,
        currency: this.getXmlAttr($, element, 'currencyID') ?? null,
        priority: this.getEstimatedValuePriority(element),
      });
    });

    const selected = candidates.sort((left, right) => {
      return left.priority - right.priority;
    })[0];

    if (selected === undefined) {
      return undefined;
    }

    return {
      amount: selected.amount,
      currency: selected.currency,
    };
  }

  private extractFirstXmlText(
    xml: string,
    localName: string,
  ): string | undefined {
    const $ = cheerio.load(xml, { xmlMode: true });

    return this.firstXmlElementText($, localName);
  }

  private extractXmlSubmissionLanguages(xml: string): string[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const values: string[] = [];

    $('*').each((_, element) => {
      if (this.getElementLocalName(element).toLowerCase() !== 'id') {
        return;
      }

      const parent = element.parent;

      if (
        parent !== null &&
        isTag(parent) &&
        this.getElementLocalName(parent).toLowerCase() === 'language'
      ) {
        values.push($(element).text());
      }
    });

    return this.uniqueNonEmptyText(values);
  }

  private extractXmlQuestionsDeadline(xml: string): string | undefined {
    const $ = cheerio.load(xml, { xmlMode: true });
    let result: string | undefined;

    $('*').each((_, element) => {
      if (
        result !== undefined ||
        this.getElementLocalName(element).toLowerCase() !==
          'additionalinformationrequestperiod'
      ) {
        return;
      }

      if (!isTag(element)) {
        return;
      }

      result = this.combineDateAndTime(
        this.firstXmlChildText($, element, 'EndDate'),
        this.firstXmlChildText($, element, 'EndTime'),
      );
    });

    return result;
  }

  private extractXmlPlannedDates(
    xml: string,
    localName: 'StartDate' | 'EndDate',
  ): string[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const values: string[] = [];

    $('*').each((_, element) => {
      if (this.getElementLocalName(element).toLowerCase() !== 'plannedperiod') {
        return;
      }

      if (!isTag(element)) {
        return;
      }

      const value = this.firstXmlChildText($, element, localName);

      if (value !== undefined) {
        values.push(value);
      }
    });

    return values;
  }

  private extractXmlContractingSystemCode(
    xml: string,
    listName: string,
  ): string | undefined {
    const $ = cheerio.load(xml, { xmlMode: true });
    let result: string | undefined;

    $('*').each((_, element) => {
      if (
        result !== undefined ||
        this.getElementLocalName(element).toLowerCase() !==
          'contractingsystemtypecode' ||
        this.getXmlAttr($, element, 'listName')?.toLowerCase() !==
          listName.toLowerCase()
      ) {
        return;
      }

      result = $(element).text().trim();
    });

    return result;
  }

  private extractXmlSubmissionMethod(xml: string): string | undefined {
    const $ = cheerio.load(xml, { xmlMode: true });
    let result: string | undefined;

    $('*').each((_, element) => {
      if (
        result !== undefined ||
        this.getElementLocalName(element).toLowerCase() !==
          'submissionmethodcode' ||
        this.getXmlAttr($, element, 'listName')?.toLowerCase() !== 'esubmission'
      ) {
        return;
      }

      result = $(element).text().trim();
    });

    return result;
  }

  private firstXmlElementText(
    $: cheerio.CheerioAPI,
    localName: string,
  ): string | undefined {
    let result: string | undefined;

    $('*').each((_, element) => {
      if (
        result !== undefined ||
        this.getElementLocalName(element).toLowerCase() !==
          localName.toLowerCase()
      ) {
        return;
      }

      const text = $(element).text().trim();

      if (text.length > 0) {
        result = text;
      }
    });

    return result;
  }

  private firstXmlChildText(
    $: cheerio.CheerioAPI,
    element: Element,
    localName: string,
  ): string | undefined {
    let result: string | undefined;

    $(element)
      .children()
      .each((_, child) => {
        if (
          result !== undefined ||
          this.getElementLocalName(child).toLowerCase() !==
            localName.toLowerCase()
        ) {
          return;
        }

        const text = $(child).text().trim();

        if (text.length > 0) {
          result = text;
        }
      });

    return result;
  }

  private getEstimatedValuePriority(element: AnyNode): number {
    if (!isTag(element)) {
      return 2;
    }

    const parentName =
      element.parent === null
        ? ''
        : this.getElementLocalName(element.parent).toLowerCase();

    if (parentName === 'requestedtendertotal') {
      return 0;
    }

    return this.hasXmlAncestor(element, 'ProcurementProjectLot') ? 2 : 1;
  }

  private hasXmlAncestor(element: AnyNode, localName: string): boolean {
    let current = isTag(element) ? element.parent : null;

    while (current !== null) {
      if (
        isTag(current) &&
        this.getElementLocalName(current).toLowerCase() ===
          localName.toLowerCase()
      ) {
        return true;
      }

      current = isTag(current) ? current.parent : null;
    }

    return false;
  }

  private getXmlAttr(
    $: cheerio.CheerioAPI,
    element: AnyNode,
    name: string,
  ): string | undefined {
    const attributes = $(element).attr();

    if (attributes === undefined) {
      return undefined;
    }

    const lowerName = name.toLowerCase();
    const entry = Object.entries(attributes).find(([key]) => {
      return key.toLowerCase() === lowerName;
    });

    return entry?.[1];
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
