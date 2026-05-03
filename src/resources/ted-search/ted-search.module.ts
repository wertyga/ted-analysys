import { forwardRef, Module } from '@nestjs/common';
import { TenderAnalysisModule } from '../tender-analysis/tender-analysis.module';
import { TedSearchController } from './ted-search.controller';
import { TedSearchService } from './ted-search.service';

@Module({
  imports: [forwardRef(() => TenderAnalysisModule)],
  controllers: [TedSearchController],
  providers: [TedSearchService],
  exports: [TedSearchService],
})
export class TedSearchModule {}
