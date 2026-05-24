import { Module } from '@nestjs/common';
import { EmailModule } from '@/resources/email/email.module';
import { TariffModule } from '@/resources/tariff';
import { TenderMatchNotificationsService } from './tender-match-notifications.service';

@Module({
  imports: [EmailModule, TariffModule],
  providers: [TenderMatchNotificationsService],
  exports: [TenderMatchNotificationsService],
})
export class TenderMatchNotificationsModule {}
