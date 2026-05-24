import { CanActivate, ExecutionContext } from '@nestjs/common';
import { PaymentEntitlementModel } from '@/resources/payments/schemas/payment-entitlement.schema';
import { TariffType } from '@/resources/tariff';
import { USER_TYPE } from '@/resources/user/user.types';

export class TariffProGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    if (!req.user) {
      return false;
    }

    if (req.user.status === USER_TYPE.ADMIN) {
      return true;
    }

    const payment = await PaymentEntitlementModel.findOne({
      user: req.user._id,
      expiration: { $gt: new Date() },
      tariffType: { $in: [TariffType.pro, TariffType.business] },
    }).lean();

    return !!payment;
  }
}
