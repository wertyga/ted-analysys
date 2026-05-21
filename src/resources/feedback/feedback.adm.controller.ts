import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiDefaultResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { FeedbackService } from './feedback.service';
import { GetFeedbackRequestDto } from './dto/feedback.dto';

@ApiTags('Admin Feedback')
@ApiBearerAuth()
@Controller('/feedback/adm')
@UseGuards(AdminAccessGuard)
export class FeedbackAdmController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get('/')
  @ApiOperation({ summary: 'Get feedback messages for admin panel' })
  @ApiQuery({ type: GetFeedbackRequestDto })
  @ApiDefaultResponse({ description: 'Paginated feedback list.' })
  getFeedbackList(@Query() query: GetFeedbackRequestDto) {
    return this.feedbackService.getFeedbackList(query);
  }

  @Patch('/:feedbackId/read')
  @ApiOperation({ summary: 'Mark feedback message as read' })
  @ApiOkResponse({ description: 'Updated feedback item.' })
  markAsRead(@Param('feedbackId') feedbackId: string) {
    return this.feedbackService.markAsRead(feedbackId);
  }
}
