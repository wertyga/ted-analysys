import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LlmModule } from './llm/llm.module';
import { CpvModule } from './resources/cpv/cpv.module';
import { TedSearchModule } from './resources/ted-search/ted-search.module';
import { TenderGeneralAnalysisModule } from './resources/tender-analysis/tender-general-analysis.module';
import { TenderDeepAnalysisModule } from './resources/tender-deep-analysis/tender-deep-analysis.module';
import { TendersModule } from './resources/tenders/tenders.module';
import { TenderWishlistModule } from './resources/tender-wishlist/tender-wishlist.module';
import { AuthModule } from './resources/auth/auth.module';
import { GetUserMiddleware } from './middlewares/auth.middleware';
import { BotDetectionMiddleware } from './middlewares/bot-detection.middleware';
import { UsersModule } from './resources/user/users.module';
import { CodelistModule } from './resources/codelist/codelist.module';
import { CompanyFilterModule } from './resources/company-filter/company-filter.module';
import { TenderMatchingModule } from './resources/tender-matching/tender-matching.module';
import { CompanyProfileDocumentsModule } from './resources/company-profile-documents/company-profile-documents.module';
import { CompanyProfileWebsiteModule } from './resources/company-profile-website/company-profile-website.module';
import { CurrencyExchangeRatesModule } from './resources/currency-exchange-rates/currency-exchange-rates.module';
import { PaymentsModule } from './resources/payments/payments.module';
import { CouponModule } from './resources/coupon';
import { FeedbackModule } from './resources/feedback/feedback.module';
import { TariffModule } from './resources/tariff';
import { AwardTenderModule } from './resources/award-tender/award-tender.module';
import { TechModule } from './resources/tech/tech.module';
import { CronModule } from './resources/cron/cron.module';
import { TenderNormalizerModule } from '@/resources/tender-normalizer/tender-normalizer.module';
import { BuyerIntelligenceModule } from '@/resources/buyer-intelligence';
import { BuyerModule } from '@/resources/buyer/buyer.module';
import { SettingsModule } from '@/resources/settings/settings.module';
import { XPostModule } from '@/resources/x-post/x-post.module';
import { MarketingTaskModule } from '@/resources/marketing-task/marketing-task.module';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      ttl: 10 * 60 * 1000,
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    CronModule,
    TedSearchModule,
    CpvModule,
    TenderWishlistModule,
    TendersModule,
    TenderGeneralAnalysisModule,
    TenderDeepAnalysisModule,
    LlmModule,
    AuthModule,
    UsersModule,
    CodelistModule,
    CompanyFilterModule,
    TenderMatchingModule,
    CompanyProfileDocumentsModule,
    CompanyProfileWebsiteModule,
    CurrencyExchangeRatesModule,
    PaymentsModule,
    CouponModule,
    FeedbackModule,
    TariffModule,
    AwardTenderModule,
    TechModule,
    TenderNormalizerModule,
    BuyerIntelligenceModule,
    BuyerModule,
    SettingsModule,
    XPostModule,
    MarketingTaskModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BotDetectionMiddleware, GetUserMiddleware).forRoutes('*');
  }
}
