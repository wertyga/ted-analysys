import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeBzpNotice } from '../countries/pl/bzp/bzp.normalizer';
import { BzpNotice } from '../countries/pl/bzp/bzp.types';
import {
  isNationalTenderId,
  NationalTendersReadService,
} from './national-tenders-read.service';
import { NationalTender } from './schemas/national-tender.schema';

const notice = JSON.parse(
  readFileSync(
    join(__dirname, '../countries/pl/bzp/__fixtures__/single-part.json'),
    'utf8',
  ),
) as BzpNotice;

describe('NationalTendersReadService', () => {
  const service = new NationalTendersReadService();
  const normalized = normalizeBzpNotice(notice)!;
  const stored = {
    ...normalized,
    sourceHash: 'hash',
    amendments: [
      {
        sourceId: '2026/BZP 00539328',
        publicationDate: new Date('2026-11-16T08:01:36Z'),
        changes: [{ field: '8.1', label: 'Termin składania ofert' }],
        patch: { submissionDeadline: new Date('2026-11-17T08:00:00Z') },
      },
    ],
  } as unknown as NationalTender;

  it('recognizes national ids', () => {
    expect(isNationalTenderId('pl-bzp-2026-00531057')).toBe(true);
    expect(isNationalTenderId('123456-2026')).toBe(false);
  });

  it('serializes to the TenderDto shape', () => {
    const dto = service.serializeDetail(stored);

    expect(dto.id).toBe(normalized.id);
    expect(dto.source).toBe('PL_BZP');
    expect(dto.sourceNoticeId).toBe(normalized.sourceId);
    expect(dto.leadBuyers).toHaveLength(1);
    expect(dto.leadBuyers[0].name).toBe(normalized.buyers[0].name);
    expect(dto.leadBuyers[0].address.country).toBe('POL');
    expect(dto.leadBuyers[0]).not.toHaveProperty('id');
    expect(dto.amendments[0]).not.toHaveProperty('patch');
    expect(dto).not.toHaveProperty('rawData');
    expect(dto).not.toHaveProperty('sourceHash');
    expect(dto).not.toHaveProperty('buyers');
  });

  it('keeps sourceHash for the analysis adapter', () => {
    const tender = service.toAnalysisTender(stored);

    expect(tender.sourceHash).toBe('hash');
    expect(tender.leadBuyers).toHaveLength(1);
  });
});
