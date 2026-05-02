import { Module } from '@nestjs/common';
import { TedSearchModule } from '../ted-search/ted-search.module';
import { TenderAnalysisModule } from '../tender-analysis/tender-analysis.module';
import { TenderNormalizerService } from './tender-normalizer.service';
import { TendersController } from './tenders.controller';
import { TendersService } from './tenders.service';

@Module({
  imports: [TedSearchModule, TenderAnalysisModule],
  controllers: [TendersController],
  providers: [TendersService, TenderNormalizerService],
  exports: [TendersService],
})
export class TendersModule {}
