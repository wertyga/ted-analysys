import { Module } from '@nestjs/common';
import { GoogleAuthModule } from '../google-auth.module';
import { GoogleAnalyticsService } from './google-analytics.service';

@Module({
  imports: [GoogleAuthModule],
  providers: [GoogleAnalyticsService],
  exports: [GoogleAnalyticsService],
})
export class GoogleAnalyticsModule {}
