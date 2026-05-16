import { Module } from '@nestjs/common';
import { CurrencyExchangeRatesService } from './currency-exchange-rates.service';

@Module({
  providers: [CurrencyExchangeRatesService],
  exports: [CurrencyExchangeRatesService],
})
export class CurrencyExchangeRatesModule {}
