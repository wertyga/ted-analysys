import { readFileSync } from 'fs';
import { join } from 'path';
import { BzpNotice } from './bzp.types';
import {
  normalizeBzpUpdateNotice,
  warsawLocalToUtc,
} from './bzp-update.normalizer';

const fixture = (name: string): BzpNotice =>
  JSON.parse(
    readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8'),
  ) as BzpNotice;

describe('warsawLocalToUtc', () => {
  it('converts winter (CET) and summer (CEST) wall-clock time', () => {
    expect(warsawLocalToUtc('2026-11-17 09:00')?.toISOString()).toBe(
      '2026-11-17T08:00:00.000Z',
    );
    expect(warsawLocalToUtc('2026-07-01 09:00')?.toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    );
  });

  it('returns undefined without a time', () => {
    expect(warsawLocalToUtc('2026-12-16')).toBeUndefined();
    expect(warsawLocalToUtc(undefined)).toBeUndefined();
  });
});

describe('normalizeBzpUpdateNotice', () => {
  it('parses a deadline change of a contract notice', () => {
    const result = normalizeBzpUpdateNotice(fixture('update-deadline'));

    expect(result?.tenderSourceId).toBe('2026/BZP 00526526');
    expect(result?.amendment.sourceId).toBe('2026/BZP 00539328');
    expect(result?.amendment.changes).toEqual([
      {
        field: '8.1',
        label: 'Termin składania ofert',
        before: '2026-11-16 09:00',
        after: '2026-11-17 09:00',
      },
      {
        field: '8.3',
        label: 'Termin otwarcia ofert',
        before: '2026-11-16 10:00',
        after: '2026-11-17 10:00',
      },
      {
        field: '8.4',
        label: 'Termin związania ofertą',
        before: '2026-12-15',
        after: '2026-12-16',
      },
    ]);
    expect(result?.amendment.patch.submissionDeadline?.toISOString()).toBe(
      '2026-11-17T08:00:00.000Z',
    );
  });

  it('keeps free-text changes without a structured patch', () => {
    const result = normalizeBzpUpdateNotice(fixture('update-description'));
    const description = result?.amendment.changes.find(
      (change) => change.field === '4.2.2',
    );

    expect(description?.label).toMatch(/Krótki opis przedmiotu zamówienia/);
    expect(description?.after).toBeTruthy();
    expect(
      result?.amendment.changes.every((change) => change.field !== ''),
    ).toBe(true);
  });

  it('ignores amendments of other notice types', () => {
    expect(
      normalizeBzpUpdateNotice(fixture('update-other-notice')),
    ).toBeUndefined();
  });
});
