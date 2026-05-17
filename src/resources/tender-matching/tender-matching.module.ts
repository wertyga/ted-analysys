import { Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TenderMatchingService } from './tender-matching.service';
import { TenderMatchingController } from './tender-matching.controller';

@Module({
  imports: [DeepSeekModule],
  controllers: [TenderMatchingController],
  providers: [TenderMatchingService],
  exports: [TenderMatchingService],
})
export class TenderMatchingModule {}
