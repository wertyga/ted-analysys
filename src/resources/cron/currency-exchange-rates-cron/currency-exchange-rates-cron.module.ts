import { Module } from '@nestjs/common';
import { CurrencyExchangeRatesModule } from '@/resources/currency-exchange-rates/currency-exchange-rates.module';
import { CurrencyExchangeRatesCronService } from './currency-exchange-rates-cron.service';

@Module({
  imports: [CurrencyExchangeRatesModule],
  providers: [CurrencyExchangeRatesCronService],
  exports: [CurrencyExchangeRatesCronService],
})
export class CurrencyExchangeRatesCronModule {}
