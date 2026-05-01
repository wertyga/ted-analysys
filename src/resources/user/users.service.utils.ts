import { Injectable } from '@nestjs/common';
import { UserModel } from './user.schema';
import { USER_TYPE } from './user.types';

@Injectable()
export class UsersServiceUtils {
  async getActiveUser({ slug }: { slug: string }) {
    return UserModel.findOne({ slug, status: { $ne: USER_TYPE.TEMPORARY } });
  }
}
