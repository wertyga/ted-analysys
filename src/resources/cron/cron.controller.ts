import { Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiDefaultResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AdminAccessGuard } from '@/guards';
import { CurrencyExchangeRatesCronService } from './currency-exchange-rates-cron/currency-exchange-rates-cron.service';
import { DbCopyTechCron } from './db-copy-cron/db-copy.tech.cron';
import { TenderMatchCronService } from './tender-match-cron/tender-match-cron.service';
import { TendersCronService } from './tenders-cron/tenders-cron.service';
import { CronSettingsService } from './cron-settings.service';

type CronTaskId =
  | 'gather-recent-competition-tenders'
  | 'gather-recent-award-tenders'
  | 'refresh-expired-competition-tender-buyer-meta'
  | 'sync-latest-rates'
  | 'send-daily-reports'
  | 'send-weekly-reports'
  | 'copy-database-dump-to-cdn';

type CronTaskDefinition = {
  id: CronTaskId;
  title: string;
  description: string;
  run: () => Promise<unknown>;
  scheduled?: boolean;
};

const CRON_TASK_IDS: CronTaskId[] = [
  'gather-recent-competition-tenders',
  'gather-recent-award-tenders',
  'refresh-expired-competition-tender-buyer-meta',
  'sync-latest-rates',
  'send-daily-reports',
  'send-weekly-reports',
  'copy-database-dump-to-cdn',
];

@ApiTags('Admin Cron')
@ApiBearerAuth()
@Controller('/adm/cron')
@UseGuards(AdminAccessGuard)
export class CronController {
  constructor(
    private readonly currencyExchangeRatesCronService: CurrencyExchangeRatesCronService,
    private readonly cronSettingsService: CronSettingsService,
    private readonly dbCopyTechCron: DbCopyTechCron,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly tenderMatchCronService: TenderMatchCronService,
    private readonly tendersCronService: TendersCronService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Available cron tasks.' })
  async getTasks() {
    const settings = await this.cronSettingsService.getCronTaskSettings();

    return {
      tasks: this.getTaskDefinitions().map(
        ({ id, title, description, scheduled }) => ({
          id,
          title,
          description,
          scheduled: Boolean(scheduled),
          schedule: scheduled
            ? {
                ...this.getScheduleState(id),
                persistedEnabled: settings[id],
              }
            : null,
        }),
      ),
    };
  }

  @Post(':taskId')
  @ApiOperation({ summary: 'Run cron task manually' })
  @ApiParam({ name: 'taskId', enum: CRON_TASK_IDS })
  @ApiDefaultResponse({ description: 'Cron task finished.' })
  async runTask(@Param('taskId') taskId: CronTaskId) {
    const task = this.getTaskDefinitions().find(({ id }) => id === taskId);

    if (!task) {
      throw new NotFoundException('Cron task not found');
    }

    const result = await task.run();

    return {
      id: task.id,
      status: 'finished',
      result: result ?? null,
    };
  }

  @Post(':taskId/enable')
  @ApiOperation({ summary: 'Enable scheduled cron task' })
  @ApiParam({ name: 'taskId', enum: CRON_TASK_IDS })
  @ApiDefaultResponse({ description: 'Cron task enabled.' })
  async enableTask(@Param('taskId') taskId: CronTaskId) {
    const task = this.getScheduledTask(taskId);

    await this.cronSettingsService.setCronTaskEnabled(task.id, true);

    return {
      id: task.id,
      schedule: this.getScheduleState(task.id),
    };
  }

  @Post(':taskId/disable')
  @ApiOperation({ summary: 'Disable scheduled cron task' })
  @ApiParam({ name: 'taskId', enum: CRON_TASK_IDS })
  @ApiDefaultResponse({ description: 'Cron task disabled.' })
  async disableTask(@Param('taskId') taskId: CronTaskId) {
    const task = this.getScheduledTask(taskId);

    await this.cronSettingsService.setCronTaskEnabled(task.id, false);

    return {
      id: task.id,
      schedule: this.getScheduleState(task.id),
    };
  }

  @Get('gather-recent-competition-tenders/status')
  @ApiOkResponse({ description: 'Recent competition tenders cron status.' })
  getRecentCompetitionTendersStatus() {
    return this.tendersCronService.getRecentCompetitionTendersStatus();
  }

  @Get('gather-recent-award-tenders/status')
  @ApiOkResponse({ description: 'Recent award tenders cron status.' })
  getRecentAwardTendersStatus() {
    return this.tendersCronService.getRecentAwardTendersStatus();
  }

  @Get('refresh-expired-competition-tender-buyer-meta/status')
  @ApiOkResponse({
    description: 'Expired competition tender buyer meta refresh status.',
  })
  getExpiredCompetitionTenderBuyerMetaStatus() {
    return this.tendersCronService.getExpiredCompetitionTenderBuyerMetaStatus();
  }

  private getTaskDefinitions(): CronTaskDefinition[] {
    return [
      {
        id: 'gather-recent-competition-tenders',
        title: 'Gather recent competition tenders',
        description:
          'Collect recent competition tenders from TED and match changed tenders.',
        scheduled: true,
        run: () => this.tendersCronService.gatherRecentCompetitionTenders(),
      },
      {
        id: 'gather-recent-award-tenders',
        title: 'Gather recent award tenders',
        description:
          'Collect recent TED result notices and update award tenders.',
        scheduled: true,
        run: () => this.tendersCronService.gatherRecentAwardTenders(),
      },
      {
        id: 'refresh-expired-competition-tender-buyer-meta',
        title: 'Refresh expired competition tender buyer meta',
        description:
          'Refresh buyer metadata for competition tenders whose submission deadline recently passed.',
        scheduled: true,
        run: () =>
          this.tendersCronService.refreshExpiredCompetitionTenderBuyerMeta(),
      },
      {
        id: 'sync-latest-rates',
        title: 'Sync latest exchange rates',
        description: 'Synchronize the latest currency exchange rates.',
        scheduled: true,
        run: () => this.currencyExchangeRatesCronService.syncLatestRatesQueued(),
      },
      {
        id: 'send-daily-reports',
        title: 'Send daily match reports',
        description: 'Send daily tender match notification reports.',
        scheduled: true,
        run: () => this.tenderMatchCronService.sendDailyReportsCron(),
      },
      {
        id: 'send-weekly-reports',
        title: 'Send weekly match reports',
        description: 'Send weekly tender match notification reports.',
        scheduled: true,
        run: () => this.tenderMatchCronService.sendWeeklyReportsCron(),
      },
      {
        id: 'copy-database-dump-to-cdn',
        title: 'Copy database dump to CDN',
        description: 'Create a MongoDB dump and upload it to CDN.',
        run: () => this.dbCopyTechCron.copyDatabaseDumpToCdn(),
      },
    ];
  }

  private getScheduledTask(taskId: CronTaskId): CronTaskDefinition {
    const task = this.getTaskDefinitions().find(({ id }) => id === taskId);

    if (!task || !task.scheduled) {
      throw new NotFoundException('Scheduled cron task not found');
    }

    return task;
  }

  private getScheduleState(taskId: CronTaskId) {
    try {
      const cronJob = this.schedulerRegistry.getCronJob(taskId);
      const job = cronJob as unknown as {
        running?: boolean;
        isActive?: boolean;
        nextDate?: () => unknown;
      };

      return {
        enabled: Boolean(job.running ?? job.isActive),
        nextRunAt: this.getNextRunAt(job),
      };
    } catch {
      return {
        enabled: false,
        nextRunAt: null,
      };
    }
  }

  private getNextRunAt(job: { nextDate?: () => unknown }) {
    try {
      const nextDate = job.nextDate?.();

      if (!nextDate) {
        return null;
      }

      if (nextDate instanceof Date) {
        return nextDate.toISOString();
      }

      if (
        typeof nextDate === 'object' &&
        nextDate !== null &&
        'toJSDate' in nextDate &&
        typeof nextDate.toJSDate === 'function'
      ) {
        return nextDate.toJSDate().toISOString();
      }

      return String(nextDate);
    } catch {
      return null;
    }
  }
}
