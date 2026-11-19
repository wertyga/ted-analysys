import { readFileSync } from 'fs';
import { Types } from 'mongoose';
import { join } from 'path';
import { normalizeBzpNotice } from '../countries/pl/bzp/bzp.normalizer';
import { BzpNotice } from '../countries/pl/bzp/bzp.types';
import { isNationalTenderRecord } from './national-tender.serializer';
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
  const { buyers, ...normalized } = normalizeBzpNotice(notice)!;
  // Populated shared buyer, as `findById` returns it.
  const buyer = {
    _id: new Types.ObjectId(),
    name: buyers[0].name,
    address: { country: 'POL' },
    identifiers: ['5261040567'],
  };
  const stored = {
    ...normalized,
    leadBuyers: [buyer],
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

  it('recognizes national ids and records', () => {
    expect(isNationalTenderId('pl-bzp-2026-00531057')).toBe(true);
    expect(isNationalTenderId('123456-2026')).toBe(false);
    expect(isNationalTenderRecord(stored)).toBe(true);
    expect(isNationalTenderRecord({ id: '123456-2026' })).toBe(false);
  });

  it('serializes to the TenderDto shape with TED-style buyers', () => {
    const dto = service.serializeDetail(stored);

    expect(dto.id).toBe(normalized.id);
    expect(dto.source).toBe('PL_BZP');
    expect(dto.sourceNoticeId).toBe(normalized.sourceId);
    expect(dto.leadBuyers).toEqual([buyer]);
    expect(dto.nonLeadBuyers).toEqual([]);
    expect(dto.amendments[0]).not.toHaveProperty('patch');
    expect(dto).not.toHaveProperty('rawData');
    expect(dto).not.toHaveProperty('sourceHash');
    expect(dto).not.toHaveProperty('buyers');
  });

  it('passes unpopulated buyer ids through, like TED lists', () => {
    const dto = service.serializeDetail({
      ...stored,
      leadBuyers: [buyer._id],
    });

    expect(dto.leadBuyers).toEqual([buyer._id]);
  });

  it('drops legacy inline buyers', () => {
    const dto = service.serializeDetail({
      ...stored,
      buyers,
    } as unknown as NationalTender);

    expect(dto).not.toHaveProperty('buyers');
  });

  it('keeps sourceHash and buyers for the analysis adapter', () => {
    const tender = service.toAnalysisTender(stored);

    expect(tender.sourceHash).toBe('hash');
    expect(tender.leadBuyers).toEqual([buyer]);
  });
});
