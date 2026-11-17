import { readFileSync } from 'fs';
import { join } from 'path';
import { BzpNotice } from './bzp.types';
import {
  buildBzpTenderId,
  mapProcedureType,
  normalizeBzpNotice,
  parseCpvCodes,
  parseDuration,
  parseMoney,
} from './bzp.normalizer';

const fixture = (name: string): BzpNotice =>
  JSON.parse(
    readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8'),
  ) as BzpNotice;

describe('BZP normalizer helpers', () => {
  it('builds tender id from BZP number', () => {
    expect(buildBzpTenderId('2026/BZP 00531057')).toBe('pl-bzp-2026-00531057');
    expect(buildBzpTenderId('garbage')).toBeUndefined();
  });

  it('parses CPV codes from API and HTML formats', () => {
    expect(
      parseCpvCodes(
        '45112723-9 (Roboty),45111291-4 (Roboty)',
        '30200000-1 - Urządzenia komputerowe',
      ),
    ).toEqual(['45112723', '45111291', '30200000']);
  });

  it('parses money with Polish decimal comma', () => {
    expect(parseMoney('1601774,85 PLN')).toEqual({
      amount: 1601774.85,
      currency: 'PLN',
    });
    expect(parseMoney('0 PLN')).toBeUndefined();
    expect(parseMoney(undefined)).toBeUndefined();
  });

  it('parses durations and end dates', () => {
    expect(parseDuration('14 dni')).toEqual({
      duration: { value: 14, unit: 'DAY' },
    });
    expect(parseDuration('12 miesięcy')).toEqual({
      duration: { value: 12, unit: 'MONTH' },
    });
    expect(parseDuration('2 lata')).toEqual({
      duration: { value: 2, unit: 'YEAR' },
    });
    expect(parseDuration('do 2026-12-31')).toEqual({
      plannedEndDate: new Date('2026-12-31T00:00:00Z'),
    });
  });

  it('maps procedure types', () => {
    expect(
      mapProcedureType(
        'Zamówienie udzielane jest w trybie podstawowym na podstawie: art. 275 pkt 1 ustawy',
      ),
    ).toBe('open');
    expect(
      mapProcedureType(
        'Zamówienie udzielane jest w trybie podstawowym na podstawie: art. 275 pkt 2 ustawy',
      ),
    ).toBe('neg-w-call');
  });
});

describe('normalizeBzpNotice', () => {
  it('normalizes a single-part notice', () => {
    const tender = normalizeBzpNotice(fixture('single-part'))!;

    expect(tender.id).toBe('pl-bzp-2026-00531064');
    expect(tender.sourceId).toBe('2026/BZP 00531064');
    expect(tender.sourceProcedureId).toBe(
      'ocds-148610-d49f13f3-4332-4171-8310-a5c38a7b4618',
    );
    expect(tender.noticeType).toBe('cn-standard');
    expect(tender.procedureType).toBe('open');
    expect(tender.contractNature).toBe('works');
    expect(tender.country).toBe('POL');
    expect(tender.submissionDeadline).toEqual(new Date('2026-11-25T07:00:00Z'));
    // 4.1.6 (value of this procedure) wins over 4.1.5 (all parts total).
    expect(tender.estimatedValue).toEqual({
      amount: 342170.61,
      currency: 'PLN',
    });
    expect(tender.mainClassificationProc).toEqual(['45112723']);
    expect(tender.cpvCodes).toEqual(
      expect.arrayContaining(['45112723', '45111291', '37535200']),
    );
    expect(tender.placeOfPerformanceSubdivisions).toEqual(['PL227']);
    expect(tender.sourceUrl).toBe(
      'https://ezamowienia.gov.pl/mp-client/search/list/ocds-148610-d49f13f3-4332-4171-8310-a5c38a7b4618',
    );
    expect(tender.submissionLanguages).toEqual(['POL']);
    expect(tender.buyers[0]).toMatchObject({
      nationalId: '6423147363',
      city: 'Rybnik',
      nuts: 'PL227',
      country: 'POL',
    });

    expect(tender.lots).toHaveLength(1);
    const [lot] = tender.lots;
    expect(lot.identifier).toBe('LOT-0001');
    expect(lot.description).toBeTruthy();
    expect(lot.duration).toEqual({ value: 120, unit: 'DAY' });
    expect(lot.awardCriteria?.[0]).toMatchObject({
      name: 'Cena',
      type: 'price',
      weight: 60,
    });
    expect(lot.awardCriteria?.length).toBeGreaterThan(1);
  });

  it('normalizes a multi-part notice into lots', () => {
    const tender = normalizeBzpNotice(fixture('multi-part'))!;

    expect(tender.id).toBe('pl-bzp-2026-00531143');
    expect(tender.lots).toHaveLength(9);
    expect(tender.lots.map((lot) => lot.identifier)).toEqual(
      Array.from({ length: 9 }, (_, i) => `LOT-000${i + 1}`),
    );
    expect(tender.lots[0].estimatedValue).toEqual({
      amount: 65573.29,
      currency: 'PLN',
    });
    expect(tender.lots[0].mainClassification).toEqual(['45453000']);
    expect(tender.lots[0].duration).toEqual({ value: 60, unit: 'DAY' });
    expect(tender.lots.every((lot) => lot.awardCriteria?.length)).toBe(true);
    expect(tender.sourceUrl).toBe('https://zbkkrakow.ezamawiajacy.pl/');
    expect(tender.description).toContain('Część 1:');
  });
});
