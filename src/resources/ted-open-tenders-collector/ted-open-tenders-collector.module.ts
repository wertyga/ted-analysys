import { forwardRef, Module } from '@nestjs/common';
import { AwardTenderModule } from '@/resources/award-tender/award-tender.module';
import { TedSearchModule } from '@/resources/ted-search/ted-search.module';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { TedOpenTendersCollectorService } from './ted-open-tenders-collector.service';

@Module({
  imports: [
    forwardRef(() => AwardTenderModule),
    forwardRef(() => TedSearchModule),
    forwardRef(() => TendersModule),
  ],
  providers: [TedOpenTendersCollectorService],
  exports: [TedOpenTendersCollectorService],
})
export class TedOpenTendersCollectorModule {}
