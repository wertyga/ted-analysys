import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DeepSeekModule } from './deepseek/deepseek.module';
import { CpvModule } from './resources/cpv/cpv.module';
import { TedSearchModule } from './resources/ted-search/ted-search.module';
import { TenderAnalysisModule } from './resources/tender-analysis/tender-analysis.module';
import { TenderDeepAnalysisModule } from './resources/tender-deep-analysis/tender-deep-analysis.module';
import { TendersCronModule } from './resources/tenders-cron/tenders-cron.module';
import { TendersModule } from './resources/tenders/tenders.module';
import { TenderWishlistModule } from './resources/tender-wishlist/tender-wishlist.module';
import { AuthModule } from './resources/auth/auth.module';
import { GetUserMiddleware } from './middlewares/auth.middleware';
import { UsersModule } from './resources/user/users.module';
import { CodelistModule } from './resources/codelist/codelist.module';
import { CompanyFilterModule } from './resources/company-filter/company-filter.module';
import { TenderMatchingModule } from './resources/tender-matching/tender-matching.module';
import { CompanyProfileDocumentsModule } from './resources/company-profile-documents/company-profile-documents.module';
import { CurrencyExchangeRatesModule } from './resources/currency-exchange-rates/currency-exchange-rates.module';
import { PaymentsModule } from './resources/payments/payments.module';
import { FeedbackModule } from './resources/feedback/feedback.module';
import { TariffModule } from './resources/tariff';
import { SimilarContractsModule } from './resources/similar-contracts/similar-contracts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TedSearchModule,
    CpvModule,
    TenderWishlistModule,
    TendersModule,
    TendersCronModule,
    TenderAnalysisModule,
    TenderDeepAnalysisModule,
    DeepSeekModule,
    AuthModule,
    UsersModule,
    CodelistModule,
    CompanyFilterModule,
    TenderMatchingModule,
    CompanyProfileDocumentsModule,
    CurrencyExchangeRatesModule,
    PaymentsModule,
    FeedbackModule,
    TariffModule,
    SimilarContractsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(GetUserMiddleware).forRoutes('*');
  }
}
