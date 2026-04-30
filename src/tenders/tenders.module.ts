import { Module } from '@nestjs/common';
import { CpvModule } from '../cpv/cpv.module';
import { TedSearchModule } from '../ted-search/ted-search.module';
import { TenderNormalizerService } from './tender-normalizer.service';
import { TendersController } from './tenders.controller';
import { TendersService } from './tenders.service';

@Module({
  imports: [TedSearchModule, CpvModule],
  controllers: [TendersController],
  providers: [TendersService, TenderNormalizerService],
})
export class TendersModule {}
