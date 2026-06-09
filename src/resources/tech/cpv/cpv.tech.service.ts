import { Injectable } from '@nestjs/common';
import { CpvCategoryModel } from '@/resources/cpv/schemas';
import { CpvCategorySlugSyncResult } from '@/resources/cpv/types';
import { string_to_slug } from '@/utils/string';

@Injectable()
export class CpvTechService {
  async updateCpvCategorySlugs(): Promise<CpvCategorySlugSyncResult> {
    const categories = await CpvCategoryModel.find().select('name slug').lean();
    const operations = categories
      .map((category) => {
        const slug = string_to_slug(category.name);

        if (category.slug === slug) {
          return null;
        }

        return {
          updateOne: {
            filter: { _id: category._id },
            update: { $set: { slug } },
          },
        };
      })
      .filter((operation): operation is NonNullable<typeof operation> => {
        return operation !== null;
      });

    if (operations.length === 0) {
      return {
        matchedCount: categories.length,
        modifiedCount: 0,
      };
    }

    const result = await CpvCategoryModel.bulkWrite(operations, {
      ordered: false,
    });

    return {
      matchedCount: categories.length,
      modifiedCount: result.modifiedCount,
    };
  }
}
