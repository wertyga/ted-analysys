import { Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { CompanyFilterController } from './company-filter.controller';
import { CompanyFilterService } from './company-filter.service';

@Module({
  imports: [DeepSeekModule],
  controllers: [CompanyFilterController],
  providers: [CompanyFilterService],
  exports: [CompanyFilterService],
})
export class CompanyFilterModule {}
