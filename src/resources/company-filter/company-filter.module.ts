import { Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TenderMatchingModule } from '@/resources/tender-matching/tender-matching.module';
import { CompanyFilterController } from './company-filter.controller';
import { CompanyFilterService } from './company-filter.service';
import { CompanyProfileDocumentsModule } from '@/resources/company-profile-documents/company-profile-documents.module';

@Module({
  imports: [DeepSeekModule, TenderMatchingModule, CompanyProfileDocumentsModule],
  controllers: [CompanyFilterController],
  providers: [CompanyFilterService],
  exports: [CompanyFilterService],
})
export class CompanyFilterModule {}
