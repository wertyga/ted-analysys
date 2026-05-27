import { Module } from '@nestjs/common';
import { TedSearchModule } from '@/resources/ted-search/ted-search.module';
import { SimilarContractsController } from './similar-contracts.controller';
import { SimilarContractsService } from './similar-contracts.service';
import { TenderNormalizerService } from '@/resources/tenders/tender-normalizer.service';
import { TendersModule } from '@/resources/tenders/tenders.module';

@Module({
  imports: [TedSearchModule, TendersModule],
  controllers: [SimilarContractsController],
  providers: [SimilarContractsService, TenderNormalizerService],
  exports: [SimilarContractsService],
})
export class SimilarContractsModule {}
