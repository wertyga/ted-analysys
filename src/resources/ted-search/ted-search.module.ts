import { forwardRef, Module } from '@nestjs/common';
import { TenderGeneralAnalysisModule } from '../tender-analysis/tender-general-analysis.module';
import { TendersModule } from '../tenders/tenders.module';
import { TedSearchController } from './ted-search.controller';
import { TedSearchService } from './ted-search.service';
import { TenderWishlistModule } from '@/resources/tender-wishlist/tender-wishlist.module';
import { CurrencyExchangeRatesModule } from '@/resources/currency-exchange-rates/currency-exchange-rates.module';
import { TariffModule } from '@/resources/tariff';

@Module({
  imports: [
    forwardRef(() => TenderGeneralAnalysisModule),
    forwardRef(() => TendersModule),
    TenderWishlistModule,
    CurrencyExchangeRatesModule,
    TariffModule,
  ],
  controllers: [TedSearchController],
  providers: [TedSearchService],
  exports: [TedSearchService],
})
export class TedSearchModule {}
