import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CRON_CONFIG } from '@/config/cron.config';
import { CronTaskQueueService } from '@/resources/cron/cron-task-queue/cron-task-queue.service';
import { TenderMatchNotificationsService } from '@/resources/tender-match-notifications/tender-match-notifications.service';

@Injectable()
export class TenderMatchCronService {
  constructor(
    private readonly tenderMatchNotificationsService: TenderMatchNotificationsService,
    private readonly cronTaskQueueService: CronTaskQueueService,
  ) {}

  @Cron(CRON_CONFIG.tenderMatchNotifications.daily, {
    name: 'send-daily-reports',
    timeZone: CRON_CONFIG.timeZone,
  })
  async sendDailyReportsCron(): Promise<void> {
    await this.cronTaskQueueService.runExclusive('sendDailyReportsCron', () =>
      this.tenderMatchNotificationsService.sendDailyReports(),
    );
  }

  @Cron(CRON_CONFIG.tenderMatchNotifications.weekly, {
    name: 'send-weekly-reports',
    timeZone: CRON_CONFIG.timeZone,
  })
  async sendWeeklyReportsCron(): Promise<void> {
    await this.cronTaskQueueService.runExclusive('sendWeeklyReportsCron', () =>
      this.tenderMatchNotificationsService.sendWeeklyReports(),
    );
  }
}
