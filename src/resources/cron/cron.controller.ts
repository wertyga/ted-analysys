import { Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiDefaultResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { CurrencyExchangeRatesCronService } from './currency-exchange-rates-cron/currency-exchange-rates-cron.service';
import { DbCopyTechCron } from './db-copy-cron/db-copy.tech.cron';
import { TenderMatchCronService } from './tender-match-cron/tender-match-cron.service';
import { TendersCronService } from './tenders-cron/tenders-cron.service';

type CronTaskId =
  | 'gather-recent-competition-tenders'
  | 'gather-recent-award-tenders'
  | 'sync-latest-rates'
  | 'send-daily-reports'
  | 'send-weekly-reports'
  | 'copy-database-dump-to-cdn';

type CronTaskDefinition = {
  id: CronTaskId;
  title: string;
  description: string;
  run: () => Promise<unknown>;
};

const CRON_TASK_IDS: CronTaskId[] = [
  'gather-recent-competition-tenders',
  'gather-recent-award-tenders',
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
    private readonly dbCopyTechCron: DbCopyTechCron,
    private readonly tenderMatchCronService: TenderMatchCronService,
    private readonly tendersCronService: TendersCronService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Available cron tasks.' })
  getTasks() {
    return {
      tasks: this.getTaskDefinitions().map(({ id, title, description }) => ({
        id,
        title,
        description,
      })),
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

  private getTaskDefinitions(): CronTaskDefinition[] {
    return [
      {
        id: 'gather-recent-competition-tenders',
        title: 'Gather recent competition tenders',
        description:
          'Collect recent competition tenders from TED and match changed tenders.',
        run: () => this.tendersCronService.gatherRecentCompetitionTenders(),
      },
      {
        id: 'gather-recent-award-tenders',
        title: 'Gather recent award tenders',
        description:
          'Collect recent TED result notices and update award tenders.',
        run: () => this.tendersCronService.gatherRecentAwardTenders(),
      },
      {
        id: 'sync-latest-rates',
        title: 'Sync latest exchange rates',
        description: 'Synchronize the latest currency exchange rates.',
        run: () => this.currencyExchangeRatesCronService.syncLatestRatesQueued(),
      },
      {
        id: 'send-daily-reports',
        title: 'Send daily match reports',
        description: 'Send daily tender match notification reports.',
        run: () => this.tenderMatchCronService.sendDailyReportsCron(),
      },
      {
        id: 'send-weekly-reports',
        title: 'Send weekly match reports',
        description: 'Send weekly tender match notification reports.',
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
}
