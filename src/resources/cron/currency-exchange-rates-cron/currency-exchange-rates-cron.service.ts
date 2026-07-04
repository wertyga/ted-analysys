import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CRON_CONFIG } from '@/config/cron.config';
import { CurrencyExchangeRatesService } from '@/resources/currency-exchange-rates/currency-exchange-rates.service';
import { CronTaskQueueService } from '@/resources/cron/cron-task-queue/cron-task-queue.service';

@Injectable()
export class CurrencyExchangeRatesCronService {
  constructor(
    private readonly currencyExchangeRatesService: CurrencyExchangeRatesService,
    private readonly cronTaskQueueService: CronTaskQueueService,
  ) {}

  @Cron(CRON_CONFIG.currencyExchangeRates.syncLatestRates, {
    name: 'sync-latest-rates',
    timeZone: CRON_CONFIG.timeZone,
  })
  async syncLatestRatesCron(): Promise<void> {
    await this.syncLatestRatesQueued();
  }

  async syncLatestRatesQueued(): Promise<void> {
    await this.cronTaskQueueService.runExclusive('syncLatestRates', () =>
      this.currencyExchangeRatesService.syncLatestRates(),
    );
  }
}
