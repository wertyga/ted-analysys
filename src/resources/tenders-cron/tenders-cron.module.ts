import { forwardRef, Module } from '@nestjs/common';
import { TedSearchModule } from '@/resources/ted-search/ted-search.module';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { TendersCronService } from './tenders-cron.service';

@Module({
  imports: [forwardRef(() => TedSearchModule), forwardRef(() => TendersModule)],
  providers: [TendersCronService],
})
export class TendersCronModule {}
