import { Module } from '@nestjs/common';
import { FeedbackAdmController } from './feedback.adm.controller';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  controllers: [FeedbackController, FeedbackAdmController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
