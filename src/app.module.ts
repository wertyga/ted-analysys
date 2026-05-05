import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DeepSeekModule } from './deepseek/deepseek.module';
import { CpvModule } from './resources/cpv/cpv.module';
import { TedSearchModule } from './resources/ted-search/ted-search.module';
import { TenderAnalysisModule } from './resources/tender-analysis/tender-analysis.module';
import { TenderDeepAnalysisModule } from './resources/tender-deep-analysis/tender-deep-analysis.module';
import { TendersModule } from './resources/tenders/tenders.module';
import { TenderWishlistModule } from './resources/tender-wishlist/tender-wishlist.module';
import { AuthModule } from './resources/auth/auth.module';
import { GetUserMiddleware } from './middlewares/auth.middleware';
import { UsersModule } from './resources/user/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TedSearchModule,
    CpvModule,
    TenderWishlistModule,
    TendersModule,
    TenderAnalysisModule,
    TenderDeepAnalysisModule,
    DeepSeekModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(GetUserMiddleware).forRoutes('*');
  }
}
