import { Module } from '@nestjs/common';
import { TedSearchModule } from '@/resources/ted-search/ted-search.module';
import { AwardTenderController } from './award-tender.controller';
import { AwardTenderService } from './award-tender.service';
import { TenderNormalizerService } from '@/resources/tenders/tender-normalizer.service';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { ContractorModule } from '@/resources/contractor/contractor.module';

@Module({
  imports: [TedSearchModule, TendersModule, ContractorModule],
  controllers: [AwardTenderController],
  providers: [AwardTenderService, TenderNormalizerService],
  exports: [AwardTenderService],
})
export class AwardTenderModule {}
