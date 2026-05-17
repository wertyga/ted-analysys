import { Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TenderMatchingService } from './tender-matching.service';

@Module({
  imports: [DeepSeekModule],
  providers: [TenderMatchingService],
  exports: [TenderMatchingService],
})
export class TenderMatchingModule {}
