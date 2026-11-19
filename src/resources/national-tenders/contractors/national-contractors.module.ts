import { Module } from '@nestjs/common';
import { ContractorModule } from '@/resources/contractor/contractor.module';
import { NationalContractorsService } from './national-contractors.service';

/** Winners of national results live in the shared `contractors` collection. */
@Module({
  imports: [ContractorModule],
  providers: [NationalContractorsService],
  exports: [NationalContractorsService],
})
export class NationalContractorsModule {}
