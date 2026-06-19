import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  GetUsersRequestDto,
  UpdateUserDto,
  UpdateUserNotificationsDto,
} from './user.dto';
import {
  TUser,
  USER_TYPE,
  UserDocument,
  UserNotificationFrequency,
} from './user.types';
import { companyCpvPopulateFields, getLimitAndSortCursor } from '@/utils';
import { UserModel } from './user.schema';
import { CpvService } from '@/resources/cpv/cpv.service';
import { TariffService } from '@/resources/tariff';

@Injectable()
export class UsersService {
  constructor(
    private readonly cpvService: CpvService,
    private readonly tariffService: TariffService,
  ) {}

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
    const userData = {
      ...data,
      industries: await this.cpvService.resolveCpvCodeIds(data.industries),
      mainServices: await this.cpvService.resolveCpvCodeIds(data.mainServices),
    };

    for (const key in data) {
      const value = userData[key];

      if (key === 'typicalContractSize' && value === null) {
        user.set(key, undefined);
        continue;
      }

      if (value !== undefined) {
        user.set(key, value);
      }
    }

    await user.save();

    return user.populate(companyCpvPopulateFields);
  }

  async updateUserNotifications(
    data: UpdateUserNotificationsDto,
    user: UserDocument,
  ) {
    await this.canEnableNotificationsGuard(data, user);

    user.notifications = {
      ...(user.notifications ?? {}),
      ...data.notifications,
    };

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

  private async canEnableNotificationsGuard(
    data: UpdateUserNotificationsDto,
    user: UserDocument,
  ): Promise<void> {
    const tariff = await this.tariffService.getUserTariff(user);

    if (tariff.rules.notifications.enabled) {
      return;
    }

    const enablesNotifications = Object.values(data.notifications).some(
      (frequency) =>
        frequency && frequency !== UserNotificationFrequency.DISABLED,
    );

    if (enablesNotifications) {
      throw new ForbiddenException(
        'Notifications are not available for this tariff',
      );
    }
  }
}
