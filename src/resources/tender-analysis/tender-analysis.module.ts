import { forwardRef, Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TendersModule } from '../tenders/tenders.module';
import { TenderDocumentTextExtractorService } from '../tenders/tender-document-text-extractor.service';
import { TenderGeneralAnalysisBuilder } from './tender-general-analysis.builder';
import { TenderGeneralAnalysisController } from './tender-general-analysis.controller';
import { TenderAnalysisService } from './tender-analysis.service';
import { TenderGeneralAnalysisService } from './tender-general-analysis.service';

@Module({
  imports: [DeepSeekModule, forwardRef(() => TendersModule)],
  controllers: [TenderGeneralAnalysisController],
  providers: [
    TenderAnalysisService,
    TenderGeneralAnalysisService,
    TenderGeneralAnalysisBuilder,
    TenderDocumentTextExtractorService,
  ],
  exports: [TenderAnalysisService, TenderGeneralAnalysisService],
})
export class TenderAnalysisModule {}
