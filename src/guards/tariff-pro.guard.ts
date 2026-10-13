import { CanActivate, ExecutionContext } from '@nestjs/common';
import { PaymentEntitlementModel } from '@/resources/payments/schemas/payment-entitlement.schema';
import { TariffType } from '@/resources/tariff';
import { USER_TYPE, UserDocument } from '@/resources/user/user.types';

/** Admin, or an active Pro/Business entitlement. */
export const hasProAccess = async (user: UserDocument): Promise<boolean> => {
  if (user.status === USER_TYPE.ADMIN) {
    return true;
  }

  const payment = await PaymentEntitlementModel.findOne({
    user: user._id,
    expiration: { $gt: new Date() },
    tariffType: { $in: [TariffType.pro, TariffType.business] },
  }).lean();

  return !!payment;
};

export class TariffProGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    if (!req.user) {
      return false;
    }

    return hasProAccess(req.user);
  }
}
