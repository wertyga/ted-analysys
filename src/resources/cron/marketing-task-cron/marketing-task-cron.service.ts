import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { CRON_CONFIG } from '@/config/cron.config';
import { CronTaskQueueService } from '@/resources/cron/cron-task-queue/cron-task-queue.service';
import { MarketingTaskGenerator } from '@/resources/marketing-task/ai/marketing-task.generate';
import { MarketingTaskChecker } from '@/resources/marketing-task/ai/marketing-task.check';
import { getSafeErrorMessage, isCronLeaderInstance } from '@/utils';

@Injectable()
export class MarketingTaskCronService {
  private readonly logger = new Logger(MarketingTaskCronService.name);

  constructor(
    private readonly marketingTaskGenerator: MarketingTaskGenerator,
    private readonly marketingTaskChecker: MarketingTaskChecker,
    private readonly cronTaskQueueService: CronTaskQueueService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CRON_CONFIG.marketingTasks.weekly, {
    name: 'generate-marketing-tasks',
    timeZone: CRON_CONFIG.timeZone,
  })
  async generateMarketingTasksCron(): Promise<void> {
    if (!isCronLeaderInstance() || !this.isAnalyticsConfigured()) {
      return;
    }

    await this.generateMarketingTasks();
  }

  @Cron(CRON_CONFIG.marketingTasks.checks, {
    name: 'check-marketing-tasks',
    timeZone: CRON_CONFIG.timeZone,
  })
  async checkMarketingTasksCron(): Promise<void> {
    if (!isCronLeaderInstance() || !this.isAnalyticsConfigured()) {
      return;
    }

    await this.checkMarketingTasks();
  }

  /** Also used by the admin "run now" action, so no leader check here. */
  generateMarketingTasks() {
    return this.cronTaskQueueService.runExclusive(
      'generateMarketingTasksCron',
      async () => {
        try {
          return await this.marketingTaskGenerator.generate({
            language: this.configService.get('MARKETING_TASKS_LANGUAGE'),
          });
        } catch (error) {
          this.logger.error(
            `Marketing task generation failed: ${getSafeErrorMessage(error)}`,
          );
        }
      },
    );
  }

  /** Also used by the admin "run now" action, so no leader check here. */
  checkMarketingTasks() {
    return this.cronTaskQueueService.runExclusive(
      'checkMarketingTasksCron',
      async () => {
        try {
          return await this.marketingTaskChecker.checkDue({
            language: this.configService.get('MARKETING_TASKS_LANGUAGE'),
          });
        } catch (error) {
          this.logger.error(
            `Scheduled marketing task checks failed: ${getSafeErrorMessage(error)}`,
          );
        }
      },
    );
  }

  private isAnalyticsConfigured(): boolean {
    return Boolean(
      this.configService.get('GSC_SITE_URL') ||
      this.configService.get('GA4_PROPERTY_ID'),
    );
  }
}
