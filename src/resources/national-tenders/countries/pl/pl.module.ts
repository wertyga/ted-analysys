import { NationalBuyersModule } from '@/resources/national-tenders/buyers/national-buyers.module';
import { Module } from '@nestjs/common';
import { NationalTendersCoreModule } from '@/resources/national-tenders/core/national-tenders-core.module';
import { BzpClient } from './bzp/bzp.client';
import { BzpNormalizer } from './bzp/bzp.normalizer';
import { BzpUpdateNormalizer } from './bzp/bzp-update.normalizer';
import { PlTendersAdmController } from './pl-tenders.adm.controller';
import { PlTendersService } from './pl-tenders.service';

/** Poland: BZP (ezamowienia.gov.pl). */
@Module({
  imports: [NationalTendersCoreModule, NationalBuyersModule],
  controllers: [PlTendersAdmController],
  providers: [BzpClient, BzpNormalizer, BzpUpdateNormalizer, PlTendersService],
  exports: [PlTendersService],
})
export class PlTendersModule {}
