import { forwardRef, Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TendersModule } from '../tenders/tenders.module';
import { TenderAnalysisModule } from '../tender-analysis/tender-analysis.module';
import { TenderDeepAnalysisBuilder } from './tender-deep-analysis.builder';
import { TenderDeepAnalysisController } from './tender-deep-analysis.controller';
import { TenderDeepAnalysisService } from './tender-deep-analysis.service';

@Module({
  imports: [
    DeepSeekModule,
    forwardRef(() => TendersModule),
    forwardRef(() => TenderAnalysisModule),
  ],
  controllers: [TenderDeepAnalysisController],
  providers: [TenderDeepAnalysisService, TenderDeepAnalysisBuilder],
  exports: [TenderDeepAnalysisService],
})
export class TenderDeepAnalysisModule {}
