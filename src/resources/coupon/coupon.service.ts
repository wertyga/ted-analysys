import { Injectable } from '@nestjs/common';
import { PaymentEntitlementDocument } from '@/resources/payments/schemas/payment-entitlement.schema';
import { PaymentsService } from '@/resources/payments/payments.service';
import { UserDocument } from '@/resources/user/user.types';
import { CouponDocument, CouponModel } from './schemas';

const FREE_USE_COUPON_CODE_LENGTH = 10;
const FREE_USE_COUPON_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class CouponService {
  constructor(private readonly paymentsService: PaymentsService) {}

  async redeemFreeUseCouponForUser(
    user: UserDocument,
  ): Promise<PaymentEntitlementDocument> {
    return this.paymentsService.createFreeCouponEntitlement(
      user,
      await this.createCouponRedemption(user),
    );
  }

  private async createCouponRedemption(
    user: UserDocument,
  ): Promise<CouponDocument> {
    return CouponModel.create({
      code: await this.generateUnusedCouponCode(),
      usedBy: user._id,
    });
  }

  private async generateUnusedCouponCode(): Promise<string> {
    let code = this.generateCouponCode();

    while (await CouponModel.exists({ code })) {
      code = this.generateCouponCode();
    }

    return code;
  }

  private generateCouponCode(): string {
    let code = '';

    for (let i = 0; i < FREE_USE_COUPON_CODE_LENGTH; i += 1) {
      code +=
        FREE_USE_COUPON_ALPHABET[
          Math.floor(Math.random() * FREE_USE_COUPON_ALPHABET.length)
        ];
    }

    return code;
  }
}
