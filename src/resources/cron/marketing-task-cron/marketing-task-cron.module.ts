import { Module } from '@nestjs/common';
import { MarketingTaskModule } from '@/resources/marketing-task/marketing-task.module';
import { MarketingTaskCronService } from './marketing-task-cron.service';

@Module({
  imports: [MarketingTaskModule],
  providers: [MarketingTaskCronService],
  exports: [MarketingTaskCronService],
})
export class MarketingTaskCronModule {}
