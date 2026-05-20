import { forwardRef, Module } from '@nestjs/common';
import { TedSearchModule } from '@/resources/ted-search/ted-search.module';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { TenderMatchingModule } from '@/resources/tender-matching/tender-matching.module';
import { CurrencyExchangeRatesModule } from '@/resources/currency-exchange-rates/currency-exchange-rates.module';
import { TendersCronService } from './tenders-cron.service';
import { TendersCronTechService } from './tenders-cron.tech.service';
import { TenderMatchNotificationsModule } from '@/resources/tender-match-notifications/tender-match-notifications.module';

@Module({
  imports: [
    forwardRef(() => TedSearchModule),
    forwardRef(() => TendersModule),
    TenderMatchingModule,
    TenderMatchNotificationsModule,
    CurrencyExchangeRatesModule,
  ],
  providers: [TendersCronService, TendersCronTechService],
})
export class TendersCronModule {}
