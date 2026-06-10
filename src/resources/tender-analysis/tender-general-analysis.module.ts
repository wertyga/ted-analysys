import { forwardRef, Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TendersModule } from '../tenders/tenders.module';
import { TenderDocumentTextExtractorService } from '../tenders/tender-document-text-extractor.service';
import { TenderGeneralAnalysisBuilder } from './tender-general-analysis.builder';
import { TenderGeneralAnalysisController } from './tender-general-analysis.controller';
import { TenderGeneralAnalysisService } from './tender-general-analysis.service';
import { TariffModule } from '@/resources/tariff';

@Module({
  imports: [DeepSeekModule, forwardRef(() => TendersModule), TariffModule],
  controllers: [TenderGeneralAnalysisController],
  providers: [
    TenderGeneralAnalysisService,
    TenderGeneralAnalysisBuilder,
    TenderDocumentTextExtractorService,
  ],
  exports: [TenderGeneralAnalysisService],
})
export class TenderGeneralAnalysisModule {}
