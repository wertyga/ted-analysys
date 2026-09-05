import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
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
import { XPostService } from './x-post.service';
import {
  GenerateXPostDto,
  GetXPostsRequestDto,
  UpdateXPostDto,
} from './dto/x-post.dto';

@ApiTags('Admin X Posts')
@ApiBearerAuth()
@Controller('/x-posts/adm')
@UseGuards(AdminAccessGuard)
export class XPostAdmController {
  constructor(private readonly xPostService: XPostService) {}

  @Post('/generate')
  @ApiOperation({ summary: 'Generate a draft X (Twitter) post with AI' })
  @ApiOkResponse({ description: 'Generated and saved X post draft.' })
  generate(@Req() req, @Body() body: GenerateXPostDto) {
    return this.xPostService.generateDraft(body, req.user?._id);
  }

  @Get('/')
  @ApiOperation({ summary: 'Get X post drafts/history for admin panel' })
  @ApiQuery({ type: GetXPostsRequestDto })
  @ApiDefaultResponse({ description: 'Paginated X post list.' })
  list(@Query() query: GetXPostsRequestDto) {
    return this.xPostService.list(query);
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get a single X post' })
  @ApiOkResponse({ description: 'X post item.' })
  getById(@Param('id') id: string) {
    return this.xPostService.getById(id);
  }

  @Patch('/:id')
  @ApiOperation({ summary: 'Update an X post (content, hashtags, status)' })
  @ApiOkResponse({ description: 'Updated X post item.' })
  update(@Param('id') id: string, @Body() body: UpdateXPostDto) {
    return this.xPostService.update(id, body);
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete an X post' })
  @ApiOkResponse({ description: 'Deletion result.' })
  remove(@Param('id') id: string) {
    return this.xPostService.remove(id);
  }

  @Post('/:id/image')
  @ApiOperation({ summary: 'Regenerate the card image for an X post' })
  @ApiOkResponse({ description: 'X post with a refreshed image URL.' })
  regenerateImage(@Param('id') id: string) {
    return this.xPostService.regenerateImage(id);
  }
}
