import { Module } from '@nestjs/common';
import { TenderMatchingService } from './tender-matching.service';

@Module({
  providers: [TenderMatchingService],
  exports: [TenderMatchingService],
})
export class TenderMatchingModule {}
