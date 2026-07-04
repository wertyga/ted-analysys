import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SettingsService } from '@/resources/settings/settings.service';

const CRON_TASK_SETTINGS_KEY = 'cron.tasks.enabled';

export type CronTaskSettings = Record<string, boolean>;

@Injectable()
export class CronSettingsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CronSettingsService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly settingsService: SettingsService,
  ) {}

  async onApplicationBootstrap() {
    await this.applySavedCronTaskSettings();
  }

  async getCronTaskSettings(): Promise<CronTaskSettings> {
    return (
      (await this.settingsService.get<CronTaskSettings>(
        CRON_TASK_SETTINGS_KEY,
      )) ?? {}
    );
  }

  async setCronTaskEnabled(taskId: string, enabled: boolean): Promise<void> {
    const settings = await this.getCronTaskSettings();

    settings[taskId] = enabled;
    await this.settingsService.set(CRON_TASK_SETTINGS_KEY, settings);
    this.applyCronTaskState(taskId, enabled);
  }

  private async applySavedCronTaskSettings(): Promise<void> {
    const settings = await this.getCronTaskSettings();

    for (const [taskId, enabled] of Object.entries(settings)) {
      this.applyCronTaskState(taskId, enabled);
    }
  }

  private applyCronTaskState(taskId: string, enabled: boolean): void {
    try {
      const cronJob = this.schedulerRegistry.getCronJob(taskId);

      if (enabled) {
        cronJob.start();
      } else {
        cronJob.stop();
      }
    } catch (error) {
      this.logger.warn(
        `Failed to apply cron task setting: task=${taskId} enabled=${enabled} error=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}
