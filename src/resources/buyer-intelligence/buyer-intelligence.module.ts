import { Module } from '@nestjs/common';
import { LlmModule } from '@/llm/llm.module';
import { CpvModule } from '@/resources/cpv/cpv.module';
import { BuyerIntelligenceController } from './buyer-intelligence.controller';
import { BuyerIntelligenceService } from './buyer-intelligence.service';

@Module({
  imports: [LlmModule, CpvModule],
  controllers: [BuyerIntelligenceController],
  providers: [BuyerIntelligenceService],
  exports: [BuyerIntelligenceService],
})
export class BuyerIntelligenceModule {}
