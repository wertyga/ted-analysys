import { forwardRef, Module } from '@nestjs/common';
import { AwardTenderController } from './award-tender.controller';
import { AwardTenderService } from './award-tender.service';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { ContractorModule } from '@/resources/contractor/contractor.module';
import { TenderNormalizerModule } from '@/resources/tender-normalizer/tender-normalizer.module';
import { BuyerModule } from '@/resources/buyer/buyer.module';
import { CurrencyExchangeRatesModule } from '@/resources/currency-exchange-rates/currency-exchange-rates.module';

@Module({
  imports: [
    forwardRef(() => TendersModule),
    ContractorModule,
    TenderNormalizerModule,
    forwardRef(() => BuyerModule),
    CurrencyExchangeRatesModule,
  ],
  controllers: [AwardTenderController],
  providers: [AwardTenderService],
  exports: [AwardTenderService],
})
export class AwardTenderModule {}
