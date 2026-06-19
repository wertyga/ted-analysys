import { Module } from '@nestjs/common';
import { TedSearchModule } from '@/resources/ted-search/ted-search.module';
import { AwardTenderController } from './award-tender.controller';
import { AwardTenderService } from './award-tender.service';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { ContractorModule } from '@/resources/contractor/contractor.module';
import { TenderNormalizerModule } from '@/resources/tender-normalizer/tender-normalizer.module';

@Module({
  imports: [
    TedSearchModule,
    TendersModule,
    ContractorModule,
    TenderNormalizerModule,
  ],
  controllers: [AwardTenderController],
  providers: [AwardTenderService],
  exports: [AwardTenderService],
})
export class AwardTenderModule {}
