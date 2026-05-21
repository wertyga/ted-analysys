import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/feedback.dto';

@ApiTags('Feedback')
@Controller('/feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post('/')
  @ApiOperation({ summary: 'Send feedback from current user' })
  @ApiCreatedResponse({ description: 'Created feedback item.' })
  createFeedback(@Req() req, @Body() body: CreateFeedbackDto) {
    return this.feedbackService.createFeedback(req.user, body);
  }
}
