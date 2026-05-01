import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CpvModule } from './resources/cpv/cpv.module';
import { TedSearchModule } from './resources/ted-search/ted-search.module';
import { TendersModule } from './resources/tenders/tenders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TedSearchModule,
    CpvModule,
    TendersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
