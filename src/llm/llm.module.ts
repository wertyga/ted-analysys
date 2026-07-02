import { Module } from '@nestjs/common';
import { LlmAnalysisService } from './llm-analysis.service';

@Module({
  providers: [LlmAnalysisService],
  exports: [LlmAnalysisService],
})
export class LlmModule {}
