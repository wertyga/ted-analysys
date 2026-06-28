import { Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { CpvModule } from '@/resources/cpv/cpv.module';
import { BuyerIntelligenceController } from './buyer-intelligence.controller';
import { BuyerIntelligenceService } from './buyer-intelligence.service';

@Module({
  imports: [DeepSeekModule, CpvModule],
  controllers: [BuyerIntelligenceController],
  providers: [BuyerIntelligenceService],
  exports: [BuyerIntelligenceService],
})
export class BuyerIntelligenceModule {}
