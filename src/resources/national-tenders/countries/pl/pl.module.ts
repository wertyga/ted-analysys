import { Module } from '@nestjs/common';
import { NationalBuyersModule } from '@/resources/national-tenders/buyers/national-buyers.module';
import { NationalContractorsModule } from '@/resources/national-tenders/contractors/national-contractors.module';
import { NationalTendersCoreModule } from '@/resources/national-tenders/core/national-tenders-core.module';
import { NationalMatchingModule } from '@/resources/national-tenders/matching/national-matching.module';
import { BzpClient } from './bzp/bzp.client';
import { BzpNormalizer } from './bzp/bzp.normalizer';
import { BzpResultNormalizer } from './bzp/bzp-result.normalizer';
import { BzpUpdateNormalizer } from './bzp/bzp-update.normalizer';
import { PlTendersAdmController } from './pl-tenders.adm.controller';
import { PlTendersService } from './pl-tenders.service';

/** Poland: BZP (ezamowienia.gov.pl). */
@Module({
  imports: [
    NationalTendersCoreModule,
    NationalBuyersModule,
    NationalContractorsModule,
    NationalMatchingModule,
  ],
  controllers: [PlTendersAdmController],
  providers: [
    BzpClient,
    BzpNormalizer,
    BzpUpdateNormalizer,
    BzpResultNormalizer,
    PlTendersService,
  ],
  exports: [PlTendersService],
})
export class PlTendersModule {}
