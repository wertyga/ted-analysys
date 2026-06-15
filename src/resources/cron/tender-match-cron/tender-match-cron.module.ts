import { Module } from '@nestjs/common';
import { TenderMatchNotificationsModule } from '@/resources/tender-match-notifications/tender-match-notifications.module';
import { TenderMatchCronService } from './tender-match-cron.service';

@Module({
  imports: [TenderMatchNotificationsModule],
  providers: [TenderMatchCronService],
})
export class TenderMatchCronModule {}
