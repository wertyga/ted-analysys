import { Injectable } from '@nestjs/common';
import { GetUsersRequestDto, UpdateUserDto } from './user.dto';
import { TUser, USER_TYPE, UserDocument } from './user.types';
import { companyCpvPopulateFields, getLimitAndSortCursor } from '@/utils';
import { UserModel } from './user.schema';
import { CpvService } from '@/resources/cpv/cpv.service';

@Injectable()
export class UsersService {
  constructor(private readonly cpvService: CpvService) {}

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
      industries: await this.cpvService.resolveCpvCodeIds(data.industries),
      mainServices: await this.cpvService.resolveCpvCodeIds(data.mainServices),
    };

    for (const key in data) {
      if (userData[key]) {
        user[key] = userData[key];
      }
    }

    await user.save();

    return user.populate(companyCpvPopulateFields);
  }

  async getUser(userId: string) {
    return UserModel.findOne({
      // @ts-ignore
      _id: userId,
      status: { $ne: USER_TYPE.TEMPORARY },
    }).populate(companyCpvPopulateFields);
  }
}
