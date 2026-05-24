import { forwardRef, Module } from '@nestjs/common';
import { TedSearchModule } from '../ted-search/ted-search.module';
import { TenderAnalysisModule } from '../tender-analysis/tender-analysis.module';
import { TenderDocumentTextExtractorService } from './tender-document-text-extractor.service';
import { TenderNormalizerService } from './tender-normalizer.service';
import { TendersAdmController } from './tenders.adm.controller';
import { TendersController } from './tenders.controller';
import { TendersService } from './tenders.service';
import { TenderWishlistModule } from '@/resources/tender-wishlist/tender-wishlist.module';
import { CurrencyExchangeRatesModule } from '@/resources/currency-exchange-rates/currency-exchange-rates.module';
import { TariffModule } from '@/resources/tariff';

@Module({
  imports: [
    forwardRef(() => TedSearchModule),
    forwardRef(() => TenderAnalysisModule),
    forwardRef(() => TenderWishlistModule),
    CurrencyExchangeRatesModule,
    TariffModule,
  ],
  controllers: [TendersController, TendersAdmController],
  providers: [
    TendersService,
    TenderNormalizerService,
    TenderDocumentTextExtractorService,
  ],
  exports: [TendersService, TenderDocumentTextExtractorService],
})
export class TendersModule {}
