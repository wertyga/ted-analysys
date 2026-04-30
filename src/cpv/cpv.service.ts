import { Injectable } from '@nestjs/common';
import {
  CpvCategoryModel,
  CpvCategory,
} from '../ted-search/schemas/cpv-category.schema';
import {
  CpvCategoriesResponse,
  CpvCategoryResponseItem,
} from '../ted-search/types/cpv-category.types';

@Injectable()
export class CpvService {
  async search(q: string, limit: number = 20): Promise<CpvCategoriesResponse> {
    const trimmedQuery = q.trim();
    const filter =
      trimmedQuery.length === 0
        ? {}
        : {
            $or: [
              { code: { $regex: this.escapeRegex(trimmedQuery), $options: 'i' } },
              { name: { $regex: this.escapeRegex(trimmedQuery), $options: 'i' } },
            ],
          };
    const items = await CpvCategoryModel.find(filter)
      .select('code name parentCode level -_id')
      .sort({ code: 1 })
      .limit(limit)
      .lean();

    return {
      count: items.length,
      items: items.map((item) => this.toResponseItem(item)),
    };
  }

  async popular(limit: number = 50): Promise<CpvCategoriesResponse> {
    const items = await CpvCategoryModel.find({ level: 2 })
      .select('code name parentCode level -_id')
      .sort({ code: 1 })
      .limit(limit)
      .lean();

    return {
      count: items.length,
      items: items.map((item) => this.toResponseItem(item)),
    };
  }

  async findByCodes(codes: string[]): Promise<CpvCategoryResponseItem[]> {
    const normalizedCodes = this.normalizeCodes(codes);

    if (normalizedCodes.length === 0) {
      return [];
    }

    const items = await CpvCategoryModel.find({ code: { $in: normalizedCodes } })
      .select('code name parentCode level -_id')
      .lean();
    const byCode = new Map(items.map((item) => [item.code, this.toResponseItem(item)]));

    return normalizedCodes
      .map((code) => byCode.get(code))
      .filter((item): item is CpvCategoryResponseItem => item !== undefined);
  }

  async findDescendantCodes(codes: string[]): Promise<string[]> {
    const normalizedCodes = this.normalizeCodes(codes);

    if (normalizedCodes.length === 0) {
      return [];
    }

    const descendants = await CpvCategoryModel.find({
      $or: normalizedCodes.map((code) => ({
        code: { $regex: `^${this.getSignificantPrefix(code)}` },
      })),
    })
      .select('code -_id')
      .lean();

    return Array.from(
      new Set([...normalizedCodes, ...descendants.map((item) => item.code)]),
    ).sort();
  }

  private normalizeCodes(codes: string[]): string[] {
    return Array.from(
      new Set(
        codes
          .map((code) => code.trim())
          .filter((code) => /^\d{8}$/.test(code)),
      ),
    );
  }

  private getSignificantPrefix(code: string): string {
    const trimmed = code.replace(/0+$/, '');

    return this.escapeRegex(trimmed.length >= 2 ? trimmed : code.slice(0, 2));
  }

  private toResponseItem(
    item: Pick<CpvCategory, 'code' | 'name' | 'parentCode' | 'level'>,
  ): CpvCategoryResponseItem {
    return {
      code: item.code,
      name: item.name,
      parentCode: item.parentCode,
      level: item.level,
    };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
