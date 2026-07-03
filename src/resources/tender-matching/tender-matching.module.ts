import { Module } from '@nestjs/common';
import { LlmModule } from '@/llm/llm.module';
import { TariffModule } from '@/resources/tariff';
import { CpvModule } from '@/resources/cpv/cpv.module';
import { TenderMatchingService } from './tender-matching.service';
import { TenderMatchingController } from './tender-matching.controller';

@Module({
  imports: [LlmModule, TariffModule, CpvModule],
  controllers: [TenderMatchingController],
  providers: [TenderMatchingService],
  exports: [TenderMatchingService],
})
export class TenderMatchingModule {}
