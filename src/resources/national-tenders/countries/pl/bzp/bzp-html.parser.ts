import * as cheerio from 'cheerio';
import { isTag, isText, type AnyNode } from 'domhandler';

/** Values of one numbered field ("4.2.6" → ["30200000-1 - Urządzenia..."]). */
export type BzpFieldMap = Record<string, string[]>;

export interface BzpParsedCriterion {
  number: number;
  /** 4.3.4 Rodzaj kryterium — absent for price criteria. */
  type?: string;
  /** 4.3.5 Nazwa kryterium. */
  name?: string;
  /** 4.3.6 Waga. */
  weight?: string;
}

export interface BzpParsedPart {
  number: number;
  fields: BzpFieldMap;
  criteria: BzpParsedCriterion[];
}

export interface BzpParsedNotice {
  /** Procedure-level fields; for single-part notices also 4.2.x / 4.3.x. */
  fields: BzpFieldMap;
  /** Parts ("Część N"); empty when the notice is not split into parts. */
  parts: BzpParsedPart[];
  /** Criteria for single-part notices. */
  criteria: BzpParsedCriterion[];
}

const FIELD_HEADING = /^(\d+(?:\.\d+)*)\.?\)?\s*(.*)$/s;
const PART_HEADING = /^Część\s+(\d+)\b/i;
const CRITERION_HEADING = /^Kryterium\s+(\d+)\b/i;
const CRITERION_FIELDS: Record<string, keyof BzpParsedCriterion> = {
  '4.3.4': 'type',
  '4.3.5': 'name',
  '4.3.6': 'weight',
};

const cleanText = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

/**
 * Parses the BZP notice `htmlBody`.
 *
 * The body is a flat sequence of `<h2>` (sections), `<h3>` (numbered fields
 * such as `4.2.6.) Główny kod CPV: <span class="normal">value</span>`),
 * `<p>`/text nodes (multi-line values), and `<h3>Część N</h3>` /
 * `<h3>Kryterium N</h3>` markers for parts and criteria.
 */
export function parseBzpHtml(html: string): BzpParsedNotice {
  const $ = cheerio.load(html.replace(/<br\s*\/?>/gi, '\n'));
  const result: BzpParsedNotice = { fields: {}, parts: [], criteria: [] };

  let part: BzpParsedPart | null = null;
  let criterion: BzpParsedCriterion | null = null;
  let current: { key: string; values: string[] } | null = null;

  const scopeFields = () => part?.fields ?? result.fields;
  const scopeCriteria = () => part?.criteria ?? result.criteria;

  const flush = () => {
    if (!current) {
      return;
    }

    const { key, values } = current;
    const criterionField = CRITERION_FIELDS[key];

    current = null;

    if (criterionField && criterion) {
      (criterion as unknown as Record<string, string>)[criterionField] =
        values.join('\n');
      return;
    }

    const fields =
      key.startsWith('4.2') || key.startsWith('4.3')
        ? scopeFields()
        : result.fields;

    (fields[key] ??= []).push(...values);
  };

  const onHeading = (node: AnyNode) => {
    const $node = $(node);
    const text = cleanText($node.text());
    const partMatch = PART_HEADING.exec(text);

    flush();

    if (partMatch) {
      part = { number: Number(partMatch[1]), fields: {}, criteria: [] };
      result.parts.push(part);
      criterion = null;
      return;
    }

    const criterionMatch = CRITERION_HEADING.exec(text);

    if (criterionMatch) {
      criterion = { number: Number(criterionMatch[1]) };
      scopeCriteria().push(criterion);
      return;
    }

    const fieldMatch = FIELD_HEADING.exec(text);

    if (!fieldMatch) {
      return;
    }

    const key = fieldMatch[1].replace(/\.$/, '');
    const inline = $node.find('span.normal').text();
    const inlineValue = cleanText(inline);

    // Any field other than criterion details closes the criterion scope.
    if (!CRITERION_FIELDS[key] && key !== '4.3.7') {
      criterion = null;
    }

    current = { key, values: inlineValue ? [inlineValue] : [] };
  };

  const walk = (nodes: AnyNode[]) => {
    for (const node of nodes) {
      if (isText(node)) {
        const value = cleanText(node.data);

        if (value && current) {
          current.values.push(value);
        }
        continue;
      }

      if (!isTag(node)) {
        continue;
      }

      const tag = node.name.toLowerCase();

      if (tag === 'style' || tag === 'script' || tag === 'header') {
        continue;
      }

      if (tag === 'h1') {
        continue;
      }

      if (tag === 'h2') {
        flush();
        part = null;
        criterion = null;
        continue;
      }

      if (tag === 'h3') {
        onHeading(node);
        continue;
      }

      if (tag === 'p' || tag === 'li') {
        const value = cleanText($(node).text());

        if (value && current) {
          current.values.push(value);
        }
        continue;
      }

      walk($(node).contents().toArray());
    }
  };

  const root = $('main').length ? $('main') : $('body');

  walk(root.contents().toArray());
  flush();

  return result;
}

/** First value of a field, if any. */
export const firstValue = (fields: BzpFieldMap, key: string) =>
  fields[key]?.[0];
