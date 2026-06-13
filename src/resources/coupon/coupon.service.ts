import { Injectable } from '@nestjs/common';
import { PaymentEntitlementDocument } from '@/resources/payments/schemas/payment-entitlement.schema';
import { PaymentsService } from '@/resources/payments/payments.service';
import { UserDocument } from '@/resources/user/user.types';
import { CouponDocument, CouponModel } from './schemas';

export const FREE_USE_COUPON_HEADER = 'x-free-use-coupon';

@Injectable()
export class CouponService {
  constructor(private readonly paymentsService: PaymentsService) {}

  async redeemFreeUseCouponForUser(
    user: UserDocument,
    code?: string,
  ): Promise<PaymentEntitlementDocument | null> {
    if (!code) {
      return null;
    }

    const coupon = await this.claimCoupon(user, code);

    if (!coupon) {
      return null;
    }

    return this.paymentsService.createFreeCouponEntitlement(user, coupon);
  }

  private async claimCoupon(
    user: UserDocument,
    code: string,
  ): Promise<CouponDocument | null> {
    const coupon = await CouponModel.findOne({
      code,
      usedBy: { $exists: true },
    });

    if (coupon) {
      return null;
    }

    return CouponModel.create({
      code,
      usedBy: user._id,
    });
  }
}
