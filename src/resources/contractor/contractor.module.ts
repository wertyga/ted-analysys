import { Module } from '@nestjs/common';
import { ContractorService } from './contractor.service';

@Module({
  providers: [ContractorService],
  exports: [ContractorService],
})
export class ContractorModule {}
