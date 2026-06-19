import { Module } from '@nestjs/common';
import { TenderNormalizerService } from './tender-normalizer.service';
import { TenderDocumentTextExtractorService } from './tender-document-text-extractor.service';

@Module({
  imports: [],
  controllers: [],
  providers: [TenderNormalizerService, TenderDocumentTextExtractorService],
  exports: [TenderNormalizerService, TenderDocumentTextExtractorService],
})
export class TenderNormalizerModule {}
