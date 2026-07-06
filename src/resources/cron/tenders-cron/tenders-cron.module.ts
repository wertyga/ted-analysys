import { forwardRef, Module } from '@nestjs/common';
import { TedSearchModule } from '@/resources/ted-search/ted-search.module';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { TenderMatchingModule } from '@/resources/tender-matching/tender-matching.module';
import { CurrencyExchangeRatesModule } from '@/resources/currency-exchange-rates/currency-exchange-rates.module';
import { TendersCronService } from './tenders-cron.service';
import { TendersCronTechService } from './tenders-cron.tech.service';
import { TenderMatchNotificationsModule } from '@/resources/tender-match-notifications/tender-match-notifications.module';
import { AwardTenderModule } from '@/resources/award-tender/award-tender.module';
import { TedOpenTendersCollectorModule } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.module';
import { BuyerModule } from '@/resources/buyer/buyer.module';

@Module({
  imports: [
    forwardRef(() => TedSearchModule),
    forwardRef(() => TendersModule),
    TenderMatchingModule,
    TenderMatchNotificationsModule,
    CurrencyExchangeRatesModule,
    AwardTenderModule,
    BuyerModule,
    TedOpenTendersCollectorModule,
  ],
  providers: [TendersCronService, TendersCronTechService],
  exports: [TendersCronService],
})
export class TendersCronModule {}
