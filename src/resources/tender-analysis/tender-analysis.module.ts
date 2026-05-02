import { Module } from '@nestjs/common';
import { OpenAiModule } from '../../openai/openai.module';
import { TenderGeneralAnalysisController } from './tender-general-analysis.controller';
import { TenderAnalysisService } from './tender-analysis.service';
import { TenderGeneralAnalysisService } from './tender-general-analysis.service';

@Module({
  imports: [OpenAiModule],
  controllers: [TenderGeneralAnalysisController],
  providers: [TenderAnalysisService, TenderGeneralAnalysisService],
  exports: [TenderAnalysisService, TenderGeneralAnalysisService],
})
export class TenderAnalysisModule {}
