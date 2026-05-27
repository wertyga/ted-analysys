import * as cheerio from 'cheerio';
import { isTag, type AnyNode, type Element } from 'domhandler';
import { EstimatedValueCandidate } from '@/resources/tenders/tender-normalizer-xml';

export interface XmlAwardWinner {
  name?: string;
  identifier?: string;
  country?: string;
  countrySub?: string;
  city?: string;
  postCode?: string;
  size?: string;
  listed?: string;
  selectionStatus?: string;
  decisionDate?: string;
}

export function extractXmlAwardValue(
  xml: string | undefined,
): EstimatedValueCandidate | undefined {
  if (!xml) return;

  const $ = cheerio.load(xml, { xmlMode: true });
  const candidates: Array<EstimatedValueCandidate & { priority: number }> = [];

  $('*').each((_, element) => {
    const localName = getElementLocalName(element).toLowerCase();

    if (localName !== 'payableamount' && localName !== 'totalamount') {
      return;
    }

    const amount = numberFromValue($(element).text());

    if (amount === undefined) {
      return;
    }

    candidates.push({
      amount,
      currency: getXmlAttr($, element, 'currencyID') ?? null,
      priority: getAwardValuePriority(element),
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

export function extractXmlAwardWinners(
  xml: string | undefined,
): XmlAwardWinner[] {
  if (!xml) return [];

  const $ = cheerio.load(xml, { xmlMode: true });
  const organizations = extractXmlOrganizations($);
  const selectionStatus = extractXmlWinnerSelectionStatus($);
  const decisionDate = extractXmlAwardDecisionDate($);
  const winners: XmlAwardWinner[] = [];

  $('*').each((_, element) => {
    if (getElementLocalName(element).toLowerCase() !== 'tenderingparty') {
      return;
    }

    if (!isTag(element)) {
      return;
    }

    const organizationId = firstXmlDescendantTextByAncestor(
      $,
      element,
      'Tenderer',
      'ID',
    );
    const organization = organizationId
      ? organizations.get(organizationId)
      : undefined;
    const hasWinnerIdentity =
      firstXmlChildText($, element, 'Name') !== undefined ||
      organization !== undefined ||
      organizationId !== undefined;

    if (!hasWinnerIdentity) {
      return;
    }

    const winner: XmlAwardWinner = {
      name:
        firstXmlChildText($, element, 'Name') ??
        organization?.name ??
        organizationId,
      identifier: organization?.identifier,
      country: organization?.country,
      countrySub: organization?.countrySub,
      city: organization?.city,
      postCode: organization?.postCode,
      size: organization?.size,
      selectionStatus,
      decisionDate,
    };

    if (Object.values(winner).some((value) => value !== undefined)) {
      winners.push(winner);
    }
  });

  return dedupeXmlAwardWinners(winners);
}

function getAwardValuePriority(element: AnyNode): number {
  const localName = getElementLocalName(element).toLowerCase();

  if (localName === 'payableamount' && hasXmlAncestor(element, 'LotTender')) {
    return 0;
  }

  if (localName === 'totalamount' && hasXmlAncestor(element, 'NoticeResult')) {
    return 1;
  }

  return 2;
}

function extractXmlWinnerSelectionStatus(
  $: cheerio.CheerioAPI,
): string | undefined {
  let result: string | undefined;

  $('*').each((_, element) => {
    if (
      result !== undefined ||
      getElementLocalName(element).toLowerCase() !== 'tenderresultcode' ||
      getXmlAttr($, element, 'listName')?.toLowerCase() !==
        'winner-selection-status'
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

function extractXmlAwardDecisionDate(
  $: cheerio.CheerioAPI,
): string | undefined {
  let settledContractIssueDate: string | undefined;
  let awardDate: string | undefined;

  $('*').each((_, element) => {
    const localName = getElementLocalName(element).toLowerCase();

    if (
      settledContractIssueDate === undefined &&
      localName === 'issuedate' &&
      hasXmlAncestor(element, 'SettledContract')
    ) {
      const text = $(element).text().trim();

      if (text.length > 0) {
        settledContractIssueDate = text;
      }
    }

    if (
      awardDate === undefined &&
      localName === 'awarddate' &&
      hasXmlAncestor(element, 'TenderResult')
    ) {
      const text = $(element).text().trim();

      if (text.length > 0) {
        awardDate = text;
      }
    }
  });

  return settledContractIssueDate ?? awardDate;
}

function extractXmlOrganizations(
  $: cheerio.CheerioAPI,
): Map<string, Omit<XmlAwardWinner, 'selectionStatus' | 'decisionDate'>> {
  const organizations = new Map<
    string,
    Omit<XmlAwardWinner, 'selectionStatus' | 'decisionDate'>
  >();

  $('*').each((_, element) => {
    if (getElementLocalName(element).toLowerCase() !== 'company') {
      return;
    }

    if (!isTag(element)) {
      return;
    }

    const organizationId = firstXmlDescendantTextByAncestor(
      $,
      element,
      'PartyIdentification',
      'ID',
    );

    if (organizationId === undefined) {
      return;
    }

    organizations.set(organizationId, {
      name: firstXmlDescendantTextByAncestor($, element, 'PartyName', 'Name'),
      identifier: firstXmlDescendantTextByAncestor(
        $,
        element,
        'PartyLegalEntity',
        'CompanyID',
      ),
      country: firstXmlDescendantTextByAncestor(
        $,
        element,
        'Country',
        'IdentificationCode',
      ),
      countrySub: firstXmlDescendantTextByAncestor(
        $,
        element,
        'PostalAddress',
        'CountrySubentityCode',
      ),
      city: firstXmlDescendantTextByAncestor(
        $,
        element,
        'PostalAddress',
        'CityName',
      ),
      postCode: firstXmlDescendantTextByAncestor(
        $,
        element,
        'PostalAddress',
        'PostalZone',
      ),
      size: firstXmlChildText($, element, 'CompanySizeCode'),
    });
  });

  return organizations;
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

function firstXmlDescendantTextByAncestor(
  $: cheerio.CheerioAPI,
  element: Element,
  ancestorLocalName: string,
  childLocalName: string,
): string | undefined {
  let result: string | undefined;

  $(element)
    .find('*')
    .each((_, child) => {
      if (
        result !== undefined ||
        getElementLocalName(child).toLowerCase() !==
          childLocalName.toLowerCase() ||
        !hasXmlAncestor(child, ancestorLocalName)
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

function dedupeXmlAwardWinners(winners: XmlAwardWinner[]): XmlAwardWinner[] {
  const seen = new Set<string>();
  const result: XmlAwardWinner[] = [];

  for (const winner of winners) {
    const key = JSON.stringify([
      winner.name ?? null,
      winner.identifier ?? null,
      winner.country ?? null,
    ]);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(winner);
  }

  return result;
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

function numberFromValue(value: unknown): number | undefined {
  const text = valueToText(value);

  if (text === undefined) {
    return undefined;
  }

  const normalized = text.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
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
