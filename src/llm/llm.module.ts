import { Global, Module } from '@nestjs/common';
import { LlmAnalysisService } from './llm-analysis.service';

@Global()
@Module({
  providers: [LlmAnalysisService],
  exports: [LlmAnalysisService],
})
export class LlmModule {}
