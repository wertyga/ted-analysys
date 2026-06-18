import { forwardRef, Module } from '@nestjs/common';
import { TedSearchModule } from '../ted-search/ted-search.module';
import { TenderGeneralAnalysisModule } from '../tender-analysis/tender-general-analysis.module';
import { TendersAdmController } from './tenders.adm.controller';
import { TendersController } from './tenders.controller';
import { TendersService } from './tenders.service';
import { TenderWishlistModule } from '@/resources/tender-wishlist/tender-wishlist.module';
import { CurrencyExchangeRatesModule } from '@/resources/currency-exchange-rates/currency-exchange-rates.module';
import { TariffModule } from '@/resources/tariff';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TenderNormalizerModule } from '@/resources/tender-normalizer/tender-normalizer.module';

@Module({
  imports: [
    forwardRef(() => TedSearchModule),
    forwardRef(() => TenderGeneralAnalysisModule),
    forwardRef(() => TenderWishlistModule),
    CurrencyExchangeRatesModule,
    DeepSeekModule,
    TariffModule,
    TenderNormalizerModule,
  ],
  controllers: [TendersAdmController, TendersController],
  providers: [TendersService],
  exports: [TendersService],
})
export class TendersModule {}
