import { Module } from '@nestjs/common';
import { DeepSeekAnalysisService } from './deepseek-analysis.service';

@Module({
  providers: [DeepSeekAnalysisService],
  exports: [DeepSeekAnalysisService],
})
export class DeepSeekModule {}
