import { Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TenderMatchingModule } from '@/resources/tender-matching/tender-matching.module';
import { CompanyFilterController } from './company-filter.controller';
import { CompanyFilterService } from './company-filter.service';

@Module({
  imports: [DeepSeekModule, TenderMatchingModule],
  controllers: [CompanyFilterController],
  providers: [CompanyFilterService],
  exports: [CompanyFilterService],
})
export class CompanyFilterModule {}
