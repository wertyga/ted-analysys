import { Module } from '@nestjs/common';
import { MarketingTaskAdmController } from './marketing-task.adm.controller';
import { MarketingTaskService } from './marketing-task.service';
import { MarketingTaskGenerator } from './ai/marketing-task.generate';
import { MarketingTaskChecker } from './ai/marketing-task.check';
import { MarketingDataService } from './marketing-data.service';
import { SearchConsoleModule } from '@/resources/analytics/search-console/search-console.module';
import { GoogleAnalyticsModule } from '@/resources/analytics/google-analytics/google-analytics.module';

@Module({
  imports: [SearchConsoleModule, GoogleAnalyticsModule],
  controllers: [MarketingTaskAdmController],
  providers: [
    MarketingTaskService,
    MarketingTaskGenerator,
    MarketingTaskChecker,
    MarketingDataService,
  ],
  exports: [MarketingTaskGenerator, MarketingTaskChecker],
})
export class MarketingTaskModule {}
