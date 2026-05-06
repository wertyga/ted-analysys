import { forwardRef, Module } from '@nestjs/common';
import { TedSearchModule } from '../ted-search/ted-search.module';
import { TenderAnalysisModule } from '../tender-analysis/tender-analysis.module';
import { TenderDocumentTextExtractorService } from './tender-document-text-extractor.service';
import { TenderNormalizerService } from './tender-normalizer.service';
import { TendersCronService } from './tenders-cron.service';
import { TendersAdmController } from './tenders.adm.controller';
import { TendersController } from './tenders.controller';
import { TendersService } from './tenders.service';

@Module({
  imports: [
    forwardRef(() => TedSearchModule),
    forwardRef(() => TenderAnalysisModule),
  ],
  controllers: [TendersController, TendersAdmController],
  providers: [
    TendersService,
    TendersCronService,
    TenderNormalizerService,
    TenderDocumentTextExtractorService,
  ],
  exports: [TendersService, TenderDocumentTextExtractorService],
})
export class TendersModule {}
