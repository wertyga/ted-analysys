import { Module } from '@nestjs/common';
import { LlmModule } from '@/llm/llm.module';
import { TariffModule } from '@/resources/tariff';
import { TenderMatchingService } from './tender-matching.service';
import { TenderMatchingController } from './tender-matching.controller';

@Module({
  imports: [LlmModule, TariffModule],
  controllers: [TenderMatchingController],
  providers: [TenderMatchingService],
  exports: [TenderMatchingService],
})
export class TenderMatchingModule {}
