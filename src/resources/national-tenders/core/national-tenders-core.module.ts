import { Module } from '@nestjs/common';
import { CurrencyExchangeRatesModule } from '@/resources/currency-exchange-rates/currency-exchange-rates.module';
import { LlmModule } from '@/llm/llm.module';
import { NationalTendersReadService } from './national-tenders-read.service';
import { NationalTendersStorageService } from './national-tenders-storage.service';

@Module({
  imports: [CurrencyExchangeRatesModule, LlmModule],
  providers: [NationalTendersStorageService, NationalTendersReadService],
  exports: [NationalTendersStorageService, NationalTendersReadService],
})
export class NationalTendersCoreModule {}
