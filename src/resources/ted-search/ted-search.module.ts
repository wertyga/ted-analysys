import { forwardRef, Module } from '@nestjs/common';
import { TenderGeneralAnalysisModule } from '../tender-analysis/tender-general-analysis.module';
import { TendersModule } from '../tenders/tenders.module';
import { TedSearchController } from './ted-search.controller';
import { TedSearchService } from './ted-search.service';
import { TenderWishlistModule } from '@/resources/tender-wishlist/tender-wishlist.module';
import { CurrencyExchangeRatesModule } from '@/resources/currency-exchange-rates/currency-exchange-rates.module';
import { TariffModule } from '@/resources/tariff';
import { TedSearchAdminController } from './ted-search.adm.controller';
import { TenderNormalizerModule } from '@/resources/tender-normalizer/tender-normalizer.module';
import { AwardTenderModule } from '@/resources/award-tender/award-tender.module';

@Module({
  imports: [
    forwardRef(() => TenderGeneralAnalysisModule),
    forwardRef(() => TendersModule),
    TenderNormalizerModule,
    TenderWishlistModule,
    CurrencyExchangeRatesModule,
    TariffModule,
    AwardTenderModule,
  ],
  controllers: [TedSearchController, TedSearchAdminController],
  providers: [TedSearchService],
  exports: [TedSearchService],
})
export class TedSearchModule {}
