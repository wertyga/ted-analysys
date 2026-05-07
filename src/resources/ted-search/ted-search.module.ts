import { forwardRef, Module } from '@nestjs/common';
import { TenderAnalysisModule } from '../tender-analysis/tender-analysis.module';
import { TendersModule } from '../tenders/tenders.module';
import { TedSearchController } from './ted-search.controller';
import { TedSearchService } from './ted-search.service';
import { TenderWishlistModule } from '@/resources/tender-wishlist/tender-wishlist.module';

@Module({
  imports: [
    forwardRef(() => TenderAnalysisModule),
    forwardRef(() => TendersModule),
    TenderWishlistModule,
  ],
  controllers: [TedSearchController],
  providers: [TedSearchService],
  exports: [TedSearchService],
})
export class TedSearchModule {}
