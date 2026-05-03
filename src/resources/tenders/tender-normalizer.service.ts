import { Injectable } from '@nestjs/common';
import {
  fillClassificationCpvByCodes,
  tenderNormilizer,
} from '../ted-search/utils';
import { TedNotice } from '../ted-search/types/ted-search.types';
import { TenderDto } from './dto/tender.dto';
import { extractPublicationNumberFromNotice, isRecord } from '@/utils';

@Injectable()
export class TenderNormalizerService {
  async normalizeTedNoticeWithCpvCodes(
    rawNotice: TedNotice,
    rawIds = false,
  ): Promise<TenderDto> {
    const { classificationCpv } = await fillClassificationCpvByCodes(
      tenderNormilizer(rawNotice),
    );

    return {
      ...this.normalizeTedNotice(rawNotice),
      classificationCpv: rawIds
        ? classificationCpv.map((category) => category._id)
        : classificationCpv,
    };
  }

  normalizeTedNotice(rawNotice: TedNotice): TenderDto {
    const publicationNumber =
      extractPublicationNumberFromNotice(rawNotice) ??
      this.pickText(rawNotice, ['publicationNumber']);

    const dto: TenderDto = {
      id: publicationNumber ?? this.createFallbackId(rawNotice),
      source: 'TED',
      sourceNoticeId:
        this.pickText(rawNotice, [
          'noticeIdentifier',
          'noticeId',
          'notice-identifier',
        ]) ?? publicationNumber,
      publicationNumber,
      noticeType: this.pickText(rawNotice, ['notice-type', 'noticeType']),
      procedureType: this.pickText(rawNotice, [
        'procedure-type',
        'procedureType',
      ]),
      title: this.pickText(rawNotice, ['notice-title', 'noticeTitle', 'title']),
      buyerName: this.pickText(rawNotice, ['buyer-name', 'buyerName']),
      buyerCountry: this.pickText(rawNotice, ['buyer-country', 'buyerCountry']),
      publicationDate: this.pickText(rawNotice, [
        'publication-date',
        'publicationDate',
      ]),
      submissionDeadline: this.pickText(rawNotice, ['deadline']),
      contractNature: this.pickText(rawNotice, [
        'contract-nature',
        'contractNature',
      ]),
      classificationCpv: Array.from(
        new Set(
          this.pickArray(rawNotice, [
            'classification-cpv',
            'classificationCpv',
          ]),
        ),
      ) as TenderDto['classificationCpv'],
      cpvCodes: Array.from(
        new Set(this.pickArray(rawNotice, ['classification-cpv'])),
      ) as TenderDto['cpvCodes'],
      links: rawNotice.links,
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
