import { forwardRef, Module } from '@nestjs/common';
import { LlmModule } from '@/llm/llm.module';
import { TendersModule } from '../tenders/tenders.module';
import { TenderGeneralAnalysisBuilder } from './tender-general-analysis.builder';
import { TenderGeneralAnalysisController } from './tender-general-analysis.controller';
import { TenderGeneralAnalysisService } from './tender-general-analysis.service';
import { TariffModule } from '@/resources/tariff';
import { TenderNormalizerModule } from '@/resources/tender-normalizer/tender-normalizer.module';

@Module({
  imports: [
    LlmModule,
    forwardRef(() => TendersModule),
    TariffModule,
    TenderNormalizerModule,
  ],
  controllers: [TenderGeneralAnalysisController],
  providers: [TenderGeneralAnalysisService, TenderGeneralAnalysisBuilder],
  exports: [TenderGeneralAnalysisService],
})
export class TenderGeneralAnalysisModule {}
