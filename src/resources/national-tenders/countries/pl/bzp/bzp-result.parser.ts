import * as cheerio from 'cheerio';
import { isTag, isText, type AnyNode } from 'domhandler';
import { BzpFieldMap } from './bzp-html.parser';

/** Winner block ("Wykonawca") of a part: numbered 7.3.x fields. */
export type BzpResultWinnerFields = BzpFieldMap;

export interface BzpResultPart {
  number: number;
  /** 4.5.x (subject), 5.x (outcome), 6.x (offers), 7.x/8.x (contract). */
  fields: BzpFieldMap;
  winners: BzpResultWinnerFields[];
}

export interface BzpParsedResult {
  /** Procedure-level fields (sections I–III, 4.1–4.4). */
  fields: BzpFieldMap;
  /** Parts; a notice without parts has a single part 1. */
  parts: BzpResultPart[];
}

const FIELD_HEADING = /^(\d+(?:\.\d+)*)\.?\)?\s*(.*)$/s;
const PART_HEADING = /^Część\s+(\d+)\b/i;
const SECTION_PART = /\(dla części\s+(\d+)\)/i;
const WINNER_HEADING = /^Wykonawca$/i;
/** Fields that belong to a part (everything from 4.5 on). */
const PART_FIELD = /^(4\.5|[5-8])(\.|$)/;

const cleanText = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

/**
 * Parses the `htmlBody` of a BZP `TenderResultNotice`.
 *
 * Sections V–VIII repeat per part with headings like
 * "SEKCJA VI OFERTY (dla części 2)"; section IV lists parts under
 * "Część N". A notice without parts has no such markers (part 1).
 * Each awarded part has a "Wykonawca" block with 7.3.x winner fields.
 */
export function parseBzpResultHtml(html: string): BzpParsedResult {
  const $ = cheerio.load(html.replace(/<br\s*\/?>/gi, '\n'));
  const result: BzpParsedResult = { fields: {}, parts: [] };

  let partNumber = 1;
  let current: { key: string; values: string[] } | null = null;

  const getPart = (number: number) => {
    let part = result.parts.find((item) => item.number === number);

    if (!part) {
      part = { number, fields: {}, winners: [] };
      result.parts.push(part);
    }

    return part;
  };

  const flush = () => {
    if (!current) {
      return;
    }

    const { key, values } = current;

    current = null;

    if (!PART_FIELD.test(key)) {
      (result.fields[key] ??= []).push(...values);
      return;
    }

    const part = getPart(partNumber);
    const target = key.startsWith('7.3')
      ? (part.winners[part.winners.length - 1] ??
        (part.winners[part.winners.length] = {}))
      : part.fields;

    (target[key] ??= []).push(...values);
  };

  const onHeading = (node: AnyNode, level: 'h2' | 'h3') => {
    const $node = $(node);
    const text = cleanText($node.text());

    flush();

    if (level === 'h2') {
      const sectionPart = SECTION_PART.exec(text);

      if (sectionPart) {
        partNumber = Number(sectionPart[1]);
      }
      return;
    }

    const partMatch = PART_HEADING.exec(text);

    if (partMatch) {
      partNumber = Number(partMatch[1]);
      getPart(partNumber);
      return;
    }

    if (WINNER_HEADING.test(text)) {
      getPart(partNumber).winners.push({});
      return;
    }

    const fieldMatch = FIELD_HEADING.exec(text);

    if (!fieldMatch) {
      return;
    }

    const key = fieldMatch[1].replace(/\.$/, '');
    const inline = cleanText($node.find('span.normal').text());

    current = { key, values: inline ? [inline] : [] };
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

      if (['style', 'script', 'header', 'footer', 'h1'].includes(tag)) {
        continue;
      }

      if (tag === 'h2' || tag === 'h3') {
        onHeading(node, tag);
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

  if (!result.parts.length) {
    getPart(1);
  }

  result.parts.sort((a, b) => a.number - b.number);

  return result;
}
