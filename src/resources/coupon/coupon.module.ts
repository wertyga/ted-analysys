import { Module } from '@nestjs/common';
import { PaymentsModule } from '@/resources/payments/payments.module';
import { CouponService } from './coupon.service';

@Module({
  imports: [PaymentsModule],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
