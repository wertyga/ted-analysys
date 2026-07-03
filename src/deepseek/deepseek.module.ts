import { Module } from '@nestjs/common';
import { LlmModule } from '@/llm/llm.module';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';

@Module({
  imports: [LlmModule],
  exports: [LlmAnalysisService],
})
export class DeepSeekModule {}

