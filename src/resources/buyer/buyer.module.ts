import { forwardRef, Module } from '@nestjs/common';
import { BuyerIntelligenceModule } from '@/resources/buyer-intelligence';
import { BuyerController } from './buyer.controller';
import { BuyerService } from './buyer.service';
import { TariffModule } from '@/resources/tariff';
import { AwardTenderModule } from '@/resources/award-tender/award-tender.module';

@Module({
  imports: [
    BuyerIntelligenceModule,
    TariffModule,
    forwardRef(() => AwardTenderModule),
  ],
  controllers: [BuyerController],
  providers: [BuyerService],
  exports: [BuyerService],
})
export class BuyerModule {}
