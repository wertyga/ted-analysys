import { Injectable } from '@nestjs/common';
import { GetUsersRequestDto } from './user.dto';
import { TUser, USER_TYPE, UserDocument } from './user.types';
import { getLimitAndSortCursor } from '@/utils';
import { UserModel } from './user.schema';

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

  async updateUser(data: Partial<TUser>, user: UserDocument) {
    const userData: Partial<TUser> = { ...data };

    for (let key in data) {
      if (userData[key] !== undefined && userData[key] !== null) {
        user[key] = userData[key];
      }
    }

    return user.save();
  }

  async getUser(userId: string) {
    return UserModel.findOne({
      // @ts-ignore
      _id: userId,
      status: { $ne: USER_TYPE.TEMPORARY },
    });
  }
}
