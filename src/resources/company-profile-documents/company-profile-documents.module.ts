import { Module } from '@nestjs/common';
import { LlmModule } from '@/llm/llm.module';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { CpvModule } from '@/resources/cpv/cpv.module';
import { CompanyProfileDocumentsController } from './company-profile-documents.controller';
import { CompanyProfileDocumentsService } from './company-profile-documents.service';
import { TenderNormalizerModule } from '@/resources/tender-normalizer/tender-normalizer.module';

@Module({
  imports: [LlmModule, TendersModule, CpvModule, TenderNormalizerModule],
  controllers: [CompanyProfileDocumentsController],
  providers: [CompanyProfileDocumentsService],
  exports: [CompanyProfileDocumentsService],
})
export class CompanyProfileDocumentsModule {}
