import { Module } from '@nestjs/common';
import { PlTendersModule } from '@/resources/national-tenders/countries/pl/pl.module';
import { PlTendersCronService } from './pl-tenders-cron.service';

/** Cron tasks of national (non-TED) tender sources, one service per country. */
@Module({
  imports: [PlTendersModule],
  providers: [PlTendersCronService],
  exports: [PlTendersCronService],
})
export class NationalTendersCronModule {}
