import { Module } from '@nestjs/common';
import { BuyerIntelligenceModule } from '@/resources/buyer-intelligence';
import { BuyerController } from './buyer.controller';
import { BuyerService } from './buyer.service';

@Module({
  imports: [BuyerIntelligenceModule],
  controllers: [BuyerController],
  providers: [BuyerService],
  exports: [BuyerService],
})
export class BuyerModule {}
