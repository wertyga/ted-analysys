import { Injectable } from '@nestjs/common';
import {
  fillClassificationCpvByCodes,
  tenderNormilizer,
} from '../ted-search/utils';
import { TedNotice } from '../ted-search/types/ted-search.types';
import { TenderDto } from './dto/tender.dto';
import { isRecord } from '@/utils';

@Injectable()
export class TenderNormalizerService {
  async normalizeTedNotice(rawNotice: TedNotice): Promise<TenderDto> {
    const normalizedNotice = await fillClassificationCpvByCodes(
      tenderNormilizer(rawNotice),
    );

    const publicationNumber = this.pickText(normalizedNotice, [
      'publicationNumber',
    ]);
    const dto: TenderDto = {
      id: publicationNumber ?? this.createFallbackId(normalizedNotice),
      source: 'TED',
      sourceNoticeId:
        this.pickText(normalizedNotice, ['noticeIdentifier', 'noticeId']) ??
        publicationNumber,
      publicationNumber,
      noticeType: this.pickText(normalizedNotice, ['noticeType']),
      procedureType: this.pickText(normalizedNotice, ['procedureType']),
      title: this.pickText(normalizedNotice, ['noticeTitle', 'title']),
      buyerName: this.pickText(normalizedNotice, ['buyerName']),
      buyerCountry: this.pickText(normalizedNotice, ['buyerCountry']),
      publicationDate: this.pickText(normalizedNotice, ['publicationDate']),
      submissionDeadline: this.pickText(normalizedNotice, ['deadline']),
      contractNature: this.pickText(normalizedNotice, ['contractNature']),
      classificationCpv: this.pickArray(normalizedNotice, [
        'classificationCpv',
      ]) as TenderDto['classificationCpv'],
      cpvCodes: this.pickArray(normalizedNotice, [
        'classificationCpv',
      ]) as TenderDto['cpvCodes'],
      links: normalizedNotice.links,
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

  private createFallbackId(rawNotice: TedNotice): string {
    const text = JSON.stringify(rawNotice);
    let hash = 0;

    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }

    return hash.toString(16);
  }
}
