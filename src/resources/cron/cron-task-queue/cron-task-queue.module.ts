import { Global, Module } from '@nestjs/common';
import { CronTaskQueueService } from './cron-task-queue.service';

@Global()
@Module({
  providers: [CronTaskQueueService],
  exports: [CronTaskQueueService],
})
export class CronTaskQueueModule {}
