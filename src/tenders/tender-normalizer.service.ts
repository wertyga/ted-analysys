import { Injectable } from '@nestjs/common';
import { CpvService } from '../cpv/cpv.service';
import { TedNotice } from '../ted-search/types/ted-search.types';
import {
  TenderCpvDto,
  TenderDto,
  TenderLotDto,
  TenderValueDto,
} from './dto/tender.dto';

@Injectable()
export class TenderNormalizerService {
  constructor(private readonly cpvService: CpvService) {}

  async normalize(
    rawNotice: TedNotice,
    includeRaw: boolean = false,
  ): Promise<TenderDto> {
    const cpvCodes = this.extractCpvCodes(rawNotice);
    const enrichedCpvCodes = await this.enrichCpvCodes(cpvCodes);
    const id = this.pickText(rawNotice, [
      'notice-identifier',
      'publication-number',
      'ND',
      'id',
      'business-id',
    ]);
    const publicationNumber = this.pickText(rawNotice, [
      'publication-number',
      'ND',
      'notice-publication-number',
    ]);

    const tender: TenderDto = {
      id: id ?? publicationNumber ?? this.createFallbackId(rawNotice),
      sourceNoticeId: this.pickText(rawNotice, [
        'notice-identifier',
        'notice-id',
        'business-id',
      ]),
      publicationNumber,
      title: this.pickText(rawNotice, ['notice-title', 'title', 'title-proc']),
      description: this.pickText(rawNotice, [
        'description-proc',
        'description-lot',
        'description',
      ]),
      buyerName: this.pickText(rawNotice, [
        'buyer-name',
        'AU',
        'business-name',
      ]),
      buyerCountry: this.pickText(rawNotice, ['buyer-country', 'CY']),
      buyerCity: this.pickText(rawNotice, ['buyer-city', 'TW']),
      publicationDate: this.pickText(rawNotice, ['publication-date', 'PD']),
      deadline: this.pickText(rawNotice, [
        'deadline',
        'deadline-date-lot',
        'deadline-receipt-tender-date-lot',
      ]),
      cpvCodes: enrichedCpvCodes,
      noticeType: this.pickText(rawNotice, ['notice-type', 'TD']),
      procedureType: this.pickText(rawNotice, ['procedure-type', 'PR']),
      estimatedValue: this.extractValue(rawNotice, [
        'estimated-value-proc',
        'estimated-value-lot',
        'total-value',
      ]),
      lots: await this.extractLots(rawNotice),
      tedUrl: this.pickText(rawNotice, ['ted-url', 'url', 'links.html']),
    };

    if (includeRaw) {
      tender.raw = rawNotice;
    }

    return tender;
  }

  async normalizeTedNotice(
    rawNotice: TedNotice,
    options: { includeRaw?: boolean } = {},
  ): Promise<TenderDto> {
    return this.normalize(rawNotice, options.includeRaw ?? false);
  }

  private async enrichCpvCodes(codes: string[]): Promise<TenderCpvDto[]> {
    const categories = await this.cpvService.findByCodes(codes);
    const byCode = new Map(
      categories.map((category) => [category.code, category]),
    );

    return codes.map((code) => {
      const category = byCode.get(code);

      return {
        code,
        label: category?.name,
        parentCode: category?.parentCode,
      };
    });
  }

  private async extractLots(rawNotice: TedNotice): Promise<TenderLotDto[]> {
    const lotCandidates = this.pickArray(rawNotice, ['lots', 'lot', 'Lots']);

    if (lotCandidates.length === 0) {
      return [];
    }

    const lots: TenderLotDto[] = [];

    for (const lot of lotCandidates) {
      if (!this.isRecord(lot)) {
        continue;
      }

      lots.push({
        id: this.pickText(lot, ['id', 'lot-identifier', 'LOT']),
        title: this.pickText(lot, ['title', 'title-lot']),
        description: this.pickText(lot, ['description', 'description-lot']),
        cpvCodes: await this.enrichCpvCodes(this.extractCpvCodes(lot)),
        estimatedValue: this.extractValue(lot, [
          'estimated-value',
          'estimated-value-lot',
        ]),
      });
    }

    return lots;
  }

  private extractValue(
    raw: Record<string, unknown>,
    amountPaths: string[],
  ): TenderValueDto | undefined {
    const amount = this.pickNumber(raw, amountPaths);
    const currency = this.pickText(raw, [
      'estimated-value-currency',
      'estimated-value-cur',
      'total-value-cur',
      'currency',
    ]);

    if (amount === undefined && currency === undefined) {
      return undefined;
    }

    return { amount, currency };
  }

  private extractCpvCodes(value: unknown): string[] {
    const codes = new Set<string>();

    this.walk(value, (currentValue, key) => {
      const shouldInspect =
        key === undefined ||
        key.toLowerCase().includes('cpv') ||
        key.toLowerCase().includes('classification');

      if (!shouldInspect) {
        return;
      }

      const text = this.valueToText(currentValue);
      if (text === undefined) {
        return;
      }

      const matches = text.match(/\b\d{8}\b/g) ?? [];

      for (const match of matches) {
        codes.add(match);
      }
    });

    return Array.from(codes).sort();
  }

  private pickText(
    raw: Record<string, unknown>,
    paths: string[],
  ): string | undefined {
    for (const path of paths) {
      const value = this.getPath(raw, path);
      const text = this.valueToText(value);

      if (text !== undefined && text.trim().length > 0) {
        return text.trim();
      }
    }

    return undefined;
  }

  private pickNumber(
    raw: Record<string, unknown>,
    paths: string[],
  ): number | undefined {
    for (const path of paths) {
      const value = this.getPath(raw, path);

      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      const text = this.valueToText(value);

      if (text === undefined) {
        continue;
      }

      const parsed = Number(text.replace(/\s/g, '').replace(',', '.'));

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return undefined;
  }

  private pickArray(raw: Record<string, unknown>, paths: string[]): unknown[] {
    for (const path of paths) {
      const value = this.getPath(raw, path);

      if (Array.isArray(value)) {
        return value;
      }
    }

    return [];
  }

  private getPath(raw: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, segment) => {
      if (!this.isRecord(current)) {
        return undefined;
      }

      return current[segment];
    }, raw);
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

      return undefined;
    }

    if (this.isRecord(value)) {
      for (const preferredKey of ['eng', 'en', 'value', 'text']) {
        const text = this.valueToText(value[preferredKey]);

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

  private walk(
    value: unknown,
    visitor: (value: unknown, key?: string) => void,
    key?: string,
  ): void {
    visitor(value, key);

    if (Array.isArray(value)) {
      for (const item of value) {
        this.walk(item, visitor, key);
      }
    } else if (this.isRecord(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        this.walk(nestedValue, visitor, nestedKey);
      }
    }
  }

  private createFallbackId(rawNotice: TedNotice): string {
    const text = JSON.stringify(rawNotice);
    let hash = 0;

    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }

    return `ted-${hash.toString(16)}`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
