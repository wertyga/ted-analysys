import { Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { CpvModule } from '@/resources/cpv/cpv.module';
import { CompanyProfileDocumentsController } from './company-profile-documents.controller';
import { CompanyProfileDocumentsService } from './company-profile-documents.service';
import { TenderNormalizerModule } from '@/resources/tender-normalizer/tender-normalizer.module';

@Module({
  imports: [DeepSeekModule, TendersModule, CpvModule, TenderNormalizerModule],
  controllers: [CompanyProfileDocumentsController],
  providers: [CompanyProfileDocumentsService],
  exports: [CompanyProfileDocumentsService],
})
export class CompanyProfileDocumentsModule {}
