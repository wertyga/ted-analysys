import * as cheerio from 'cheerio';
import axios from 'axios';
import { isTag, type AnyNode, type Element } from 'domhandler';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import { Tender, TenderDocumentsLinks } from '@/resources/tenders/schemas';

export interface TextCandidate {
  text: string;
  language?: string;
}

export interface EstimatedValueCandidate {
  amount: number | null;
  currency: string | null;
}

export interface XmlAwardCriterion {
  name?: string;
  description?: string;
  type?: string;
  weight?: string;
}

export function findXmlUrl<T extends TenderDocumentsLinks>(
  links: T | undefined,
): string | undefined {
  const xmlLinkObj = links?.xml;

  if (!xmlLinkObj || typeof xmlLinkObj !== 'object') {
    return undefined;
  }

  return (
    xmlLinkObj.MUL ??
    xmlLinkObj.mul ??
    Object.entries(xmlLinkObj).find(([language]) =>
      /eng|en/i.test(language),
    )?.[1] ??
    Object.values(xmlLinkObj)[0]
  );
}

export async function fetchXmlContentFromNotice<T extends TenderDocumentsLinks>(
  links: T | undefined,
): Promise<string | undefined> {
  const xmlUrl = findXmlUrl(links);

  return fetchXmlContentFromUrl(xmlUrl);
}

export async function fetchXmlContentFromUrl(
  sourceUrl?: string,
): Promise<string | undefined> {
  if (sourceUrl === undefined || !/^https?:\/\//i.test(sourceUrl)) {
    return undefined;
  }

  const response = await axios.get<string | ArrayBuffer>(sourceUrl, {
    responseType: 'text',
    timeout: 30_000,
    headers: {
      Accept: 'application/xml, text/xml, text/plain, */*',
    },
    maxContentLength: 25 * 1024 * 1024,
    maxBodyLength: 25 * 1024 * 1024,
  });

  const content =
    typeof response.data === 'string'
      ? response.data
      : Buffer.from(response.data).toString('utf8');

  return content.includes('<') ? content : undefined;
}

export function extractXmlDescriptionCandidates(xml: string): TextCandidate[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const candidates: TextCandidate[] = [];

  $('*').each((_, element) => {
    if (getElementLocalName(element).toLowerCase() !== 'description') {
      return;
    }

    const parent = element.parent;

    if (
      parent === null ||
      !isTag(parent) ||
      getElementLocalName(parent).toLowerCase() !== 'procurementproject'
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
        getXmlAttr($, element, 'languageID') ??
        getXmlAttr($, element, 'xml:lang') ??
        getXmlAttr($, element, 'lang'),
    });
  });

  return candidates;
}

export function extractXmlEstimatedValue(
  xml: string,
): EstimatedValueCandidate | undefined {
  const $ = cheerio.load(xml, { xmlMode: true });
  const candidates: Array<EstimatedValueCandidate & { priority: number }> = [];

  $('*').each((_, element) => {
    if (
      getElementLocalName(element).toLowerCase() !==
      'estimatedoverallcontractamount'
    ) {
      return;
    }

    const amount = numberFromValue($(element).text());

    if (amount === undefined) {
      return;
    }

    candidates.push({
      amount,
      currency: getXmlAttr($, element, 'currencyID') ?? null,
      priority: getEstimatedValuePriority(element),
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

export function extractXmlChildTextsByParent(
  xml: string,
  parentLocalName: string,
  childLocalName: string,
): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const values: string[] = [];

  $('*').each((_, element) => {
    if (
      getElementLocalName(element).toLowerCase() !==
        childLocalName.toLowerCase() ||
      element.parent === null ||
      !isTag(element.parent) ||
      getElementLocalName(element.parent).toLowerCase() !==
        parentLocalName.toLowerCase()
    ) {
      return;
    }

    values.push($(element).text());
  });

  return uniqueNonEmptyText(values);
}

export function extractFirstXmlChildTextByParent(
  xml: string,
  parentLocalName: string,
  childLocalName: string,
): string | undefined {
  return extractXmlChildTextsByParent(xml, parentLocalName, childLocalName)[0];
}

export function extractXmlSubmissionLanguages(xml: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const values: string[] = [];

  $('*').each((_, element) => {
    if (getElementLocalName(element).toLowerCase() !== 'id') {
      return;
    }

    const parent = element.parent;

    if (
      parent !== null &&
      isTag(parent) &&
      getElementLocalName(parent).toLowerCase() === 'language'
    ) {
      values.push($(element).text());
    }
  });

  return uniqueNonEmptyText(values);
}

export function extractXmlQuestionsDeadline(xml: string): string | undefined {
  return extractXmlDeadlinePeriod(xml, 'AdditionalInformationRequestPeriod');
}

export function extractXmlDeadlinePeriod(
  xml: string,
  periodLocalName: string,
): string | undefined {
  const $ = cheerio.load(xml, { xmlMode: true });
  let result: string | undefined;

  $('*').each((_, element) => {
    if (
      result !== undefined ||
      getElementLocalName(element).toLowerCase() !==
        periodLocalName.toLowerCase()
    ) {
      return;
    }

    if (!isTag(element)) {
      return;
    }

    result = combineDateAndTime(
      firstXmlChildText($, element, 'EndDate'),
      firstXmlChildText($, element, 'EndTime'),
    );
  });

  return result;
}

export function extractXmlPlannedDates(
  xml: string,
  localName: 'StartDate' | 'EndDate',
): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const values: string[] = [];

  $('*').each((_, element) => {
    if (getElementLocalName(element).toLowerCase() !== 'plannedperiod') {
      return;
    }

    if (!isTag(element)) {
      return;
    }

    const value = firstXmlChildText($, element, localName);

    if (value !== undefined) {
      values.push(value);
    }
  });

  return values;
}

export function extractXmlContractingSystemCode(
  xml: string,
  listName: string,
): string | undefined {
  const $ = cheerio.load(xml, { xmlMode: true });
  let result: string | undefined;

  $('*').each((_, element) => {
    if (
      result !== undefined ||
      getElementLocalName(element).toLowerCase() !==
        'contractingsystemtypecode' ||
      getXmlAttr($, element, 'listName')?.toLowerCase() !==
        listName.toLowerCase()
    ) {
      return;
    }

    result = $(element).text().trim();
  });

  return result;
}

export function extractXmlSubmissionMethod(xml: string): string | undefined {
  const $ = cheerio.load(xml, { xmlMode: true });
  let result: string | undefined;

  $('*').each((_, element) => {
    if (
      result !== undefined ||
      getElementLocalName(element).toLowerCase() !== 'submissionmethodcode' ||
      getXmlAttr($, element, 'listName')?.toLowerCase() !== 'esubmission'
    ) {
      return;
    }

    result = $(element).text().trim();
  });

  return result;
}

export function extractXmlCpvCodes(xml: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const values: string[] = [];

  $('*').each((_, element) => {
    const localName = getElementLocalName(element).toLowerCase();

    if (
      localName !== 'itemclassificationcode' &&
      localName !== 'commodityclassificationcode'
    ) {
      return;
    }

    values.push($(element).text());
  });

  return uniqueNonEmptyText(values);
}

export function extractXmlUrlsByAncestor(
  xml: string,
  ancestorLocalNames: string[],
): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const values: string[] = [];

  $('*').each((_, element) => {
    const localName = getElementLocalName(element).toLowerCase();

    if (localName !== 'uri' && localName !== 'endpointid') {
      return;
    }

    if (
      !ancestorLocalNames.some((ancestorLocalName) =>
        hasXmlAncestor(element, ancestorLocalName),
      )
    ) {
      return;
    }

    const text = $(element).text().trim();

    if (/^https?:\/\//i.test(text)) {
      values.push(text);
    }
  });

  return uniqueNonEmptyText(values);
}

export function extractXmlAwardCriteria(xml: string): XmlAwardCriterion[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const criteria: XmlAwardCriterion[] = [];

  $('*').each((_, element) => {
    const localName = getElementLocalName(element).toLowerCase();

    if (
      localName !== 'subordinateawardingcriterion' &&
      localName !== 'awardingcriterion'
    ) {
      return;
    }

    if (!isTag(element)) {
      return;
    }

    const criterion: XmlAwardCriterion = {
      name: firstXmlChildText($, element, 'Name'),
      description: firstXmlChildText($, element, 'Description'),
      type: firstXmlChildText($, element, 'AwardingCriterionTypeCode'),
      weight: extractAwardCriterionWeight($, element),
    };

    if (
      criterion.name !== undefined ||
      criterion.description !== undefined ||
      criterion.type !== undefined
    ) {
      criteria.push(criterion);
    }
  });

  return dedupeAwardCriteria(criteria);
}

function extractAwardCriterionWeight(
  $: cheerio.CheerioAPI,
  criterion: Element,
): string | undefined {
  let result: string | undefined;

  $(criterion)
    .find('*')
    .each((_, element) => {
      if (
        result !== undefined ||
        getElementLocalName(element).toLowerCase() !== 'awardcriterionparameter'
      ) {
        return;
      }

      if (!isTag(element)) {
        return;
      }

      const parameterCode = findFirstChildByLocalName(
        $,
        element,
        'ParameterCode',
      );
      const listName =
        parameterCode === undefined
          ? undefined
          : getXmlAttr($, parameterCode, 'listName')?.toLowerCase();

      if (listName !== 'number-weight') {
        return;
      }

      result = firstXmlChildText($, element, 'ParameterNumeric');
    });

  return result;
}

function firstXmlChildText(
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
        getElementLocalName(child).toLowerCase() !== localName.toLowerCase()
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

function findFirstChildByLocalName(
  $: cheerio.CheerioAPI,
  element: Element,
  localName: string,
): Element | undefined {
  let result: Element | undefined;

  $(element)
    .children()
    .each((_, child) => {
      if (
        result === undefined &&
        isTag(child) &&
        getElementLocalName(child).toLowerCase() === localName.toLowerCase()
      ) {
        result = child;
      }
    });

  return result;
}

function dedupeAwardCriteria(
  criteria: XmlAwardCriterion[],
): XmlAwardCriterion[] {
  const seen = new Set<string>();
  const result: XmlAwardCriterion[] = [];

  for (const criterion of criteria) {
    const key = JSON.stringify([
      criterion.name ?? null,
      criterion.description ?? null,
      criterion.type ?? null,
      criterion.weight ?? null,
    ]);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(criterion);
  }

  return result;
}

function getEstimatedValuePriority(element: AnyNode): number {
  if (!isTag(element)) {
    return 2;
  }

  const parentName =
    element.parent === null
      ? ''
      : getElementLocalName(element.parent).toLowerCase();

  if (parentName === 'requestedtendertotal') {
    return 0;
  }

  return hasXmlAncestor(element, 'ProcurementProjectLot') ? 2 : 1;
}

function hasXmlAncestor(element: AnyNode, localName: string): boolean {
  let current = isTag(element) ? element.parent : null;

  while (current !== null) {
    if (
      isTag(current) &&
      getElementLocalName(current).toLowerCase() === localName.toLowerCase()
    ) {
      return true;
    }

    current = isTag(current) ? current.parent : null;
  }

  return false;
}

function getXmlAttr(
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

function getElementLocalName(node: AnyNode): string {
  return isTag(node) ? getLocalName(node.tagName) : '';
}

function getLocalName(key: string): string {
  const withoutAttributePrefix = key.replace(/^@_?/, '');
  const parts = withoutAttributePrefix.split(':');

  return parts[parts.length - 1];
}

function combineDateAndTime(
  date: string | undefined,
  time: string | undefined,
): string | undefined {
  if (date === undefined) {
    return undefined;
  }

  const dateParts = date.match(/^(\d{4}-\d{2}-\d{2})(Z|[+-]\d{2}:\d{2})?$/);

  if (!dateParts) {
    return time === undefined ? date : `${date}T${time}`;
  }

  const dateOnly = dateParts[1];
  const dateOffset = dateParts[2];

  if (time === undefined) {
    return dateOffset === undefined
      ? dateOnly
      : `${dateOnly}T00:00:00${dateOffset}`;
  }

  const timeParts = time.match(
    /^(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)(Z|[+-]\d{2}:\d{2})?$/,
  );

  if (!timeParts) {
    return `${dateOnly}T${time}`;
  }

  const timeOnly = timeParts[1];
  const timeOffset = timeParts[2];

  return `${dateOnly}T${timeOnly}${timeOffset ?? dateOffset ?? 'Z'}`;
}

function uniqueNonEmptyText(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => valueToText(value)?.trim())
        .filter(
          (value): value is string => value !== undefined && value.length > 0,
        ),
    ),
  );
}

function valueToText(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function numberFromValue(value: unknown): number | undefined {
  const text = valueToText(value);

  if (text === undefined) {
    return undefined;
  }

  const normalized = text.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}
