import { Module } from '@nestjs/common';
import { EmailModule } from '@/resources/email/email.module';
import { TenderMatchNotificationsService } from './tender-match-notifications.service';

@Module({
  imports: [EmailModule],
  providers: [TenderMatchNotificationsService],
  exports: [TenderMatchNotificationsService],
})
export class TenderMatchNotificationsModule {}
