import { NationalAwardsStorageService } from './national-awards-storage.service';
import { Module } from '@nestjs/common';
import { CurrencyExchangeRatesModule } from '@/resources/currency-exchange-rates/currency-exchange-rates.module';
import { LlmModule } from '@/llm/llm.module';
import { NationalTendersReadService } from './national-tenders-read.service';
import { NationalTendersStorageService } from './national-tenders-storage.service';

@Module({
  imports: [CurrencyExchangeRatesModule, LlmModule],
  providers: [
    NationalTendersStorageService,
    NationalTendersReadService,
    NationalAwardsStorageService,
  ],
  exports: [
    NationalTendersStorageService,
    NationalTendersReadService,
    NationalAwardsStorageService,
  ],
})
export class NationalTendersCoreModule {}
