import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CRON_CONFIG } from '@/config/cron.config';
import { CronTaskQueueService } from '@/resources/cron/cron-task-queue/cron-task-queue.service';
import { PlTendersService } from '@/resources/national-tenders/countries/pl/pl-tenders.service';
import { isCronLeaderInstance } from '@/utils';

/** Cron task id, managed in the admin panel (`/admin/cron`). */
export const PL_BZP_CRON_TASK_ID = 'gather-pl-bzp-tenders';

/** Poland (BZP): daily collection of new tenders and deadline changes. */
@Injectable()
export class PlTendersCronService {
  constructor(
    private readonly plTendersService: PlTendersService,
    private readonly cronTaskQueueService: CronTaskQueueService,
  ) {}

  // Off until enabled in the admin panel; the saved state is applied on boot.
  @Cron(CRON_CONFIG.nationalTenders.plBzp, {
    name: PL_BZP_CRON_TASK_ID,
    timeZone: CRON_CONFIG.timeZone,
    disabled: true,
  })
  async gatherPlBzpTendersCron(): Promise<void> {
    if (!isCronLeaderInstance()) {
      return;
    }

    await this.gatherPlBzpTendersQueued();
  }

  /** Runs after any other cron task in progress (shared queue). */
  async gatherPlBzpTendersQueued(): Promise<void> {
    await this.cronTaskQueueService.runExclusive('gatherPlBzpTenders', () =>
      this.plTendersService.runRecent(),
    );
  }

  getStatus() {
    return this.plTendersService.getStatus();
  }
}
