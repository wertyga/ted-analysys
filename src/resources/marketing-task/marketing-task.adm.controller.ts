import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { MarketingTaskService } from './marketing-task.service';
import { MarketingTaskGenerator } from './ai/marketing-task.generate';
import { MarketingTaskChecker } from './ai/marketing-task.check';
import {
  AddMarketingTaskCommentDto,
  CheckMarketingTaskDto,
  CreateMarketingTaskDto,
  GenerateMarketingTasksDto,
  GetMarketingTasksRequestDto,
  UpdateMarketingTaskDto,
} from './dto/marketing-task.dto';

@ApiTags('Admin Marketing Tasks')
@ApiBearerAuth()
@Controller('/marketing-tasks/adm')
@UseGuards(AdminAccessGuard)
export class MarketingTaskAdmController {
  constructor(
    private readonly marketingTaskService: MarketingTaskService,
    private readonly marketingTaskGenerator: MarketingTaskGenerator,
    private readonly marketingTaskChecker: MarketingTaskChecker,
  ) {}

  @Post('/generate')
  @ApiOperation({
    summary:
      'Analyze Search Console + GA4 data with AI and create improvement tasks',
  })
  @ApiOkResponse({ description: 'Created tasks and analysis run summary.' })
  generate(@Body() body: GenerateMarketingTasksDto) {
    return this.marketingTaskGenerator.generate(body);
  }

  @Get('/')
  @ApiOperation({ summary: 'Get marketing tasks for admin panel' })
  @ApiQuery({ type: GetMarketingTasksRequestDto })
  @ApiDefaultResponse({ description: 'Paginated marketing task list.' })
  list(@Query() query: GetMarketingTasksRequestDto) {
    return this.marketingTaskService.list(query);
  }

  @Post('/')
  @ApiOperation({ summary: 'Create a marketing task manually' })
  @ApiOkResponse({ description: 'Created marketing task.' })
  create(@Body() body: CreateMarketingTaskDto) {
    return this.marketingTaskService.create(body);
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get a single marketing task' })
  @ApiOkResponse({ description: 'Marketing task item.' })
  getById(@Param('id') id: string) {
    return this.marketingTaskService.getById(id);
  }

  @Patch('/:id')
  @ApiOperation({
    summary: 'Update a marketing task (status, priority, notes)',
  })
  @ApiOkResponse({ description: 'Updated marketing task.' })
  update(@Param('id') id: string, @Body() body: UpdateMarketingTaskDto) {
    return this.marketingTaskService.update(id, body);
  }

  @Post('/:id/check')
  @ApiOperation({
    summary:
      'Check one task with AI: live page + metrics of its page/query; the result is added to the history',
  })
  @ApiOkResponse({ description: 'Updated task and data source errors.' })
  check(@Param('id') id: string, @Body() body: CheckMarketingTaskDto) {
    return this.marketingTaskChecker.check(id, body);
  }

  @Post('/:id/comments')
  @ApiOperation({
    summary:
      'Add a comment to the task history (progress, blockers); the AI reads it on the next run',
  })
  @ApiOkResponse({ description: 'Updated marketing task.' })
  addComment(
    @Param('id') id: string,
    @Body() body: AddMarketingTaskCommentDto,
  ) {
    return this.marketingTaskService.addComment(id, body);
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete a marketing task' })
  @ApiOkResponse({ description: 'Deletion result.' })
  remove(@Param('id') id: string) {
    return this.marketingTaskService.remove(id);
  }
}
