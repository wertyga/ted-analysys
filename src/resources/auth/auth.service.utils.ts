import { UserModel } from '@/resources/user/user.schema';
import { USER_TYPE } from '@/resources/user/user.types';
import { gfErrors } from '@/goldfish';

export class AuthServiceUtils {
  async checkIfUserExist(
    fieldForCheck: Record<string, string>[],
    error: any = gfErrors.entityExists('User'),
  ) {
    const existsUser = await UserModel.findOne({
      $or: fieldForCheck,
    });

    if (existsUser && existsUser.status !== USER_TYPE.TEMPORARY) {
      throw error;
    }

    return existsUser;
  }
}
