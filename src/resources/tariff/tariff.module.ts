import { Module } from '@nestjs/common';
import { PaymentsModule } from '@/resources/payments/payments.module';
import { TariffService } from './tariff.service';

@Module({
  imports: [PaymentsModule],
  providers: [TariffService],
  exports: [TariffService],
})
export class TariffModule {}
