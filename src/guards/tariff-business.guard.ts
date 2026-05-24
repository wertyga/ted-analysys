import { CanActivate, ExecutionContext } from '@nestjs/common';
import { PaymentEntitlementModel } from '@/resources/payments/schemas/payment-entitlement.schema';
import { TariffType } from '@/resources/tariff';

export class TariffBusinessGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    if (!req.user) {
      return false;
    }

    const payment = await PaymentEntitlementModel.findOne({
      user: req.user._id,
      expiration: { $gt: new Date() },
      tariffType: TariffType.business,
    }).lean();

    return !!payment;
  }
}
