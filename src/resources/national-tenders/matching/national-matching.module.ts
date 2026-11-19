import { Module } from '@nestjs/common';
import { TenderMatchingModule } from '@/resources/tender-matching/tender-matching.module';
import { TenderMatchNotificationsModule } from '@/resources/tender-match-notifications/tender-match-notifications.module';
import { NationalTenderMatchingService } from './national-tender-matching.service';

@Module({
  imports: [TenderMatchingModule, TenderMatchNotificationsModule],
  providers: [NationalTenderMatchingService],
  exports: [NationalTenderMatchingService],
})
export class NationalMatchingModule {}
