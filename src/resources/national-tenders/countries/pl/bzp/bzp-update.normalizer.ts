import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { isTag } from 'domhandler';
import {
  NationalTenderChange,
  NationalTenderPatch,
  NationalTenderSource,
  NormalizedNationalAmendment,
} from '@/resources/national-tenders/core/national-tender.types';
import { firstValue, parseBzpHtml } from './bzp-html.parser';
import { BzpNotice } from './bzp.types';

/** 3.1 value for amendments of a contract notice (the only ones we store). */
const AMENDED_CONTRACT_NOTICE = /^Ogłoszenie o zamówieniu$/i;
const CHANGE_FIELD = '3.4.1';
const CHANGE_TEXT =
  /^(\d+(?:\.\d+)*)\.?\s+(.*?)\s*Przed zmianą:\s*(.*?)\s*Po zmianie:\s*(.*)$/s;

const cleanText = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

/**
 * Converts a Europe/Warsaw wall-clock time ("2026-11-17 09:00") to UTC.
 * BZP prints dates in the notice text in Polish local time.
 */
export function warsawLocalToUtc(text?: string): Date | undefined {
  const match = /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/.exec(text ?? '');

  if (!match) {
    return undefined;
  }

  const [, y, mo, d, h, mi] = match.map(Number);
  const wallClockAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (time: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Warsaw',
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .formatToParts(new Date(time))
        .map((part) => [part.type, part.value]),
    );

    return (
      Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
      ) - time
    );
  };

  // Second pass settles the offset near DST switches.
  let utc = wallClockAsUtc - offsetAt(wallClockAsUtc);
  utc = wallClockAsUtc - offsetAt(utc);

  return new Date(utc);
}

/** Splits the `3.4.1` blocks of a `NoticeUpdateNotice` into field changes. */
export function parseBzpChanges(html: string): NationalTenderChange[] {
  const $ = cheerio.load(html.replace(/<br\s*\/?>/gi, '\n'));
  const changes: NationalTenderChange[] = [];

  $('h3').each((_, heading) => {
    const headingText = cleanText($(heading).text());

    if (!headingText.startsWith(`${CHANGE_FIELD}.)`)) {
      return;
    }

    const texts: string[] = [];

    for (
      let node = heading.nextSibling;
      node && !(isTag(node) && /^h[1-3]$/i.test(node.name));
      node = node.nextSibling
    ) {
      texts.push($(node).text());
    }

    const text = cleanText(texts.join('\n')).replace(/\n/g, ' ');
    const match = CHANGE_TEXT.exec(text);

    changes.push(
      match
        ? {
            field: match[1],
            label: match[2] || undefined,
            before: match[3] || undefined,
            after: match[4] || undefined,
          }
        : { field: '', after: text || undefined },
    );
  });

  return changes;
}

/** Structured fields we can apply from free-text changes. */
function buildPatch(changes: NationalTenderChange[]): NationalTenderPatch {
  const patch: NationalTenderPatch = {};

  for (const change of changes) {
    if (
      change.field === '8.1' &&
      /termin składania ofert/i.test(change.label ?? '')
    ) {
      const deadline = warsawLocalToUtc(change.after);

      if (deadline) {
        patch.submissionDeadline = deadline;
      }
    }
  }

  return patch;
}

/**
 * Normalizes a BZP `NoticeUpdateNotice` that amends a contract notice.
 * Returns undefined for amendments of other notice types (results, contract
 * performance, ...). Pure: no I/O.
 */
export function normalizeBzpUpdateNotice(
  notice: BzpNotice,
): NormalizedNationalAmendment | undefined {
  const fields = parseBzpHtml(notice.htmlBody ?? '').fields;
  const amendedType = firstValue(fields, '3.1')?.trim() ?? '';
  const tenderSourceId = firstValue(fields, '3.2')?.trim();

  if (!AMENDED_CONTRACT_NOTICE.test(amendedType) || !tenderSourceId) {
    return undefined;
  }

  const changes = parseBzpChanges(notice.htmlBody);
  const publicationDate = new Date(notice.publicationDate);

  return {
    source: NationalTenderSource.PL_BZP,
    tenderSourceId,
    amendment: {
      sourceId: notice.bzpNumber,
      publicationDate: Number.isNaN(publicationDate.getTime())
        ? undefined
        : publicationDate,
      changes,
      patch: buildPatch(changes),
    },
  };
}

@Injectable()
export class BzpUpdateNormalizer {
  normalize(notice: BzpNotice): NormalizedNationalAmendment | undefined {
    return normalizeBzpUpdateNotice(notice);
  }
}
