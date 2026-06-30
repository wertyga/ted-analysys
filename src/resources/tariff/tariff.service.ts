import { Injectable } from '@nestjs/common';
import { PaymentsService } from '@/resources/payments/payments.service';
import { USER_TYPE, UserDocument } from '@/resources/user/user.types';
import { TARIFF_RULES } from './tariff-rules';
import { TariffType, UserTariff } from './tariff.types';

@Injectable()
export class TariffService {
  constructor(private readonly paymentsService: PaymentsService) {}

  async getUserTariff(user?: UserDocument | null): Promise<UserTariff> {
    const type = await this.getUserTariffType(user);

    return {
      type,
      rules: TARIFF_RULES[type],
    };
  }

  async getUserTariffType(user?: UserDocument | null): Promise<TariffType> {
    if (!user) {
      return TariffType.free;
    }

    if (user?.status === USER_TYPE.ADMIN) {
      return TariffType.pro;
    }

    const entitlement = await this.paymentsService.getUserEntitlement(user);

    return entitlement?.tariffType ?? TariffType.free;
  }
}
