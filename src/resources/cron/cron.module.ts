import { Module } from '@nestjs/common';
import { CronTaskQueueModule } from './cron-task-queue/cron-task-queue.module';
import { CurrencyExchangeRatesCronModule } from './currency-exchange-rates-cron/currency-exchange-rates-cron.module';
import { DbCopyCronModule } from './db-copy-cron/db-copy-cron.module';
import { TenderMatchCronModule } from './tender-match-cron/tender-match-cron.module';
import { TendersCronModule } from './tenders-cron/tenders-cron.module';
import { MarketingTaskCronModule } from './marketing-task-cron/marketing-task-cron.module';
import { CronController } from './cron.controller';
import { SettingsModule } from '@/resources/settings/settings.module';
import { CronSettingsService } from './cron-settings.service';

@Module({
  imports: [
    CronTaskQueueModule,
    TendersCronModule,
    CurrencyExchangeRatesCronModule,
    TenderMatchCronModule,
    DbCopyCronModule,
    MarketingTaskCronModule,
    SettingsModule,
  ],
  controllers: [CronController],
  providers: [CronSettingsService],
  exports: [DbCopyCronModule],
})
export class CronModule {}
