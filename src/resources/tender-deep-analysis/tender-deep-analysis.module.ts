import { forwardRef, Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TendersModule } from '../tenders/tenders.module';
import { TenderGeneralAnalysisModule } from '../tender-analysis/tender-general-analysis.module';
import { CompanyFilterModule } from '@/resources/company-filter/company-filter.module';
import { CompanyProfileDocumentsModule } from '@/resources/company-profile-documents/company-profile-documents.module';
import { TenderDeepAnalysisBuilder } from './tender-deep-analysis.builder';
import {
  TenderDeepAnalysisController,
  UserTenderDeepAnalysisController,
} from './tender-deep-analysis.controller';
import { TenderDeepDocumentInputService } from './tender-deep-document-input.service';
import { TenderDeepAnalysisService } from './tender-deep-analysis.service';

@Module({
  imports: [
    DeepSeekModule,
    CompanyFilterModule,
    CompanyProfileDocumentsModule,
    forwardRef(() => TendersModule),
    forwardRef(() => TenderGeneralAnalysisModule),
  ],
  controllers: [TenderDeepAnalysisController, UserTenderDeepAnalysisController],
  providers: [
    TenderDeepAnalysisService,
    TenderDeepAnalysisBuilder,
    TenderDeepDocumentInputService,
  ],
  exports: [TenderDeepAnalysisService],
})
export class TenderDeepAnalysisModule {}
