import { BadRequestException, Injectable } from '@nestjs/common';
import { GetUsersRequestDto, UpdateUserDto } from './user.dto';
import { TUser, USER_TYPE, UserDocument } from './user.types';
import { getLimitAndSortCursor } from '@/utils';
import { UserModel } from './user.schema';
import { CpvCategoryModel } from '@/resources/cpv/schemas';
import { CPV_CODES_LIST_FIELDS } from '@/resources/cpv/cpv.service';

const userCpvPopulateFields = [
  { path: 'industries', select: CPV_CODES_LIST_FIELDS },
  { path: 'mainServices', select: CPV_CODES_LIST_FIELDS },
];

@Injectable()
export class UsersService {
  constructor() {}

  async getUsersList({
    sortDirection,
    sortBy,
    limit,
    offset,
  }: GetUsersRequestDto) {
    const [users, total] = await Promise.all([
      getLimitAndSortCursor(
        { limit, offset, sortDirection, sortBy },
        UserModel.find({}),
      ),
      UserModel.countDocuments({}),
    ]);

    return { users, total };
  }

  async updateUser(data: UpdateUserDto, user: UserDocument) {
    const userData: Partial<TUser> = {
      ...data,
      industries: await this.resolveCpvCodeIds(data.industries, 'industries'),
      mainServices: await this.resolveCpvCodeIds(
        data.mainServices,
        'mainServices',
      ),
    };

    for (let key in data) {
      if (userData[key] !== undefined && userData[key] !== null) {
        user[key] = userData[key];
      }
    }

    await user.save();

    return user.populate(userCpvPopulateFields);
  }

  async getUser(userId: string) {
    return UserModel.findOne({
      // @ts-ignore
      _id: userId,
      status: { $ne: USER_TYPE.TEMPORARY },
    }).populate(userCpvPopulateFields);
  }

  private async resolveCpvCodeIds(codes: string[], fieldName: string) {
    const uniqueCodes = Array.from(new Set(codes));
    const categories = await CpvCategoryModel.find({
      code: { $in: uniqueCodes },
    }).select('_id code');
    const categoryByCode = new Map(
      categories.map((category) => [category.code, category]),
    );
    const missingCodes = uniqueCodes.filter(
      (code) => !categoryByCode.has(code),
    );

    if (missingCodes.length > 0) {
      throw new BadRequestException({
        message: `${fieldName} contains unknown CPV codes`,
        codes: missingCodes,
      });
    }

    return codes.map((code) => categoryByCode.get(code)!._id);
  }
}
