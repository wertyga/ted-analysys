import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { CpvCategoryModel, CpvCategory } from './schemas';
import {
  CpvCategoriesResponse,
  CpvCategoryResponseItem,
  CpvCategorySyncResult,
} from './types';

export const CPV_CODES_LIST_FIELDS = 'code name parentCode level';

@Injectable()
export class CpvService {
  private readonly cpvCodelistUrl: string;

  constructor() {
    this.cpvCodelistUrl =
      'https://docs.ted.europa.eu/eforms/latest/reference/code-lists/cpv.html';
  }

  async search(q: string, limit: number = 20): Promise<CpvCategoriesResponse> {
    const trimmedQuery = q.trim();
    const filter =
      trimmedQuery.length === 0
        ? {}
        : {
            $or: [
              {
                code: { $regex: this.escapeRegex(trimmedQuery), $options: 'i' },
              },
              {
                name: { $regex: this.escapeRegex(trimmedQuery), $options: 'i' },
              },
            ],
          };
    const [items, count] = await Promise.all([
      CpvCategoryModel.find(filter)
        .select(CPV_CODES_LIST_FIELDS)
        .sort({ code: 1 })
        .limit(limit)
        .lean(),
      CpvCategoryModel.countDocuments(filter),
    ]);

    return {
      count,
      items: items.map((item) => this.toResponseItem(item)),
    };
  }

  async updateCpvCategories(): Promise<CpvCategorySyncResult> {
    const response = await axios.get<string>(this.cpvCodelistUrl, {
      timeout: 30000,
    });
    const sourceVersion = this.parseCpvSourceVersion(response.data);
    const categories = this.parseCpvCategoriesFromHtml(
      response.data,
      sourceVersion,
    );

    if (categories.length === 0) {
      throw new ServiceUnavailableException(
        'CPV codelist source did not contain any categories',
      );
    }

    const existingCodes = new Set(categories.map((category) => category.code));
    const categoriesWithParents = categories.map((category) => ({
      ...category,
      parentCode: this.findCpvParentCode(category.code, existingCodes),
    }));

    const result = await CpvCategoryModel.bulkWrite(
      categoriesWithParents.map((category) => ({
        updateOne: {
          filter: { code: category.code },
          update: { $set: category },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return {
      sourceVersion,
      fetchedCount: categoriesWithParents.length,
      insertedCount: result.insertedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
      matchedCount: result.matchedCount,
    };
  }

  async findByCodes(codes: string[]): Promise<CpvCategoryResponseItem[]> {
    const normalizedCodes = this.normalizeCodes(codes);

    if (normalizedCodes.length === 0) {
      return [];
    }

    const items = await CpvCategoryModel.find({
      code: { $in: normalizedCodes },
    })
      .select(CPV_CODES_LIST_FIELDS)
      .lean();
    const byCode = new Map(
      items.map((item) => [item.code, this.toResponseItem(item)]),
    );

    return normalizedCodes
      .map((code) => byCode.get(code))
      .filter((item): item is CpvCategoryResponseItem => !!item);
  }

  async resolveCodeIds(codes: string[]): Promise<string[]> {
    const normalizedCodes = this.normalizeCodes(codes);

    if (normalizedCodes.length === 0) {
      return [];
    }

    const items = await CpvCategoryModel.find({
      code: { $in: normalizedCodes },
    }).select('_id code');

    return items.map((code) => code._id.toString());
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

  async findDescendants(codes: string[]): Promise<CpvCategoriesResponse> {
    const normalizedCodes = this.normalizeCodes(codes);

    if (normalizedCodes.length === 0) {
      return { count: 0, items: [] };
    }

    const categories = await CpvCategoryModel.find({
      $or: normalizedCodes.map((code) => {
        return {
          code: { $regex: `^${this.getSignificantPrefix(code)}` },
        };
      }),
    })
      .select(CPV_CODES_LIST_FIELDS)
      .sort({ level: 1 })
      .lean()
      .then((codes) => codes.slice(normalizedCodes.length));

    return {
      count: categories.length,
      items: categories.map((category) => this.toResponseItem(category)),
    };
  }

  private normalizeCodes(codes: string[]): string[] {
    return Array.from(
      new Set(
        codes.map((code) => code.trim()).filter((code) => /^\d{8}$/.test(code)),
      ),
    );
  }

  private getSignificantPrefix(code: string): string {
    const trimmed = code.replace(/0+$/, '');

    return this.escapeRegex(trimmed.length >= 2 ? trimmed : code.slice(0, 2));
  }

  private parseCpvSourceVersion(html: string): string {
    const versionMatch = html.match(
      /Version\s*<\/td>\s*<td class="hdlist2">\s*<p>(\d{4})<\/p>/i,
    );

    return versionMatch?.[1] ?? '2008';
  }

  private parseCpvCategoriesFromHtml(
    html: string,
    sourceVersion: string,
  ): CpvCategory[] {
    const codeLabelPattern =
      /<code>(\d{8})<\/code>[\s\S]*?<td class="hdlist2">\s*<p>(.*?)<\/p>/gis;
    const categories: CpvCategory[] = [];
    const seenCodes = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = codeLabelPattern.exec(html)) !== null) {
      const code = match[1];

      if (seenCodes.has(code)) {
        continue;
      }

      seenCodes.add(code);
      categories.push({
        code,
        name: this.decodeHtml(this.stripHtml(match[2])).trim(),
        level: this.getCpvCodeLevel(code),
        sourceVersion,
      });
    }

    return categories;
  }

  private findCpvParentCode(
    code: string,
    existingCodes: Set<string>,
  ): string | undefined {
    for (
      let parentLevel = this.getCpvCodeLevel(code) - 1;
      parentLevel >= 2;
      parentLevel -= 1
    ) {
      const parentCode = code.slice(0, parentLevel).padEnd(8, '0');

      if (existingCodes.has(parentCode)) {
        return parentCode;
      }
    }

    return undefined;
  }

  private getCpvCodeLevel(code: string): number {
    const lastSignificantDigit = code.search(/0+$/);

    if (lastSignificantDigit === -1) {
      return code.length;
    }

    return Math.max(2, lastSignificantDigit);
  }

  async getCpvCategories(): Promise<CpvCategoriesResponse> {
    const categories = await CpvCategoryModel.find()
      .select(CPV_CODES_LIST_FIELDS)
      .sort({ code: 1 })
      .lean();

    return {
      count: categories.length,
      items: categories.map((category) => this.toResponseItem(category)),
    };
  }

  async getIndustries(): Promise<CpvCategoriesResponse> {
    const categories = await CpvCategoryModel.find({ level: 2 })
      .select(CPV_CODES_LIST_FIELDS)
      .sort({ code: 1 })
      .lean();

    return {
      count: categories.length,
      items: categories.map((category) => this.toResponseItem(category)),
    };
  }

  async getActivities() {
    const categories = await CpvCategoryModel.find({ level: { $ne: 2 } })
      .select(CPV_CODES_LIST_FIELDS)
      .sort({ code: 1 })
      .lean();

    return {
      count: categories.length,
      items: categories.map((category) => this.toResponseItem(category)),
    };
  }

  private stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, '');
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  private toResponseItem(item: CpvCategory): CpvCategoryResponseItem {
    return CPV_CODES_LIST_FIELDS.split(' ').reduce((acc, field) => {
      acc[field] = item[field];

      return acc;
    }, {} as CpvCategoryResponseItem);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
