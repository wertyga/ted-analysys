import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AwardTenderAwardsRequestDto } from './dto/award-tender-awards-request.dto';
import { AwardTenderService } from './award-tender.service';
import { TendersService } from '@/resources/tenders/tenders.service';

@ApiTags('award-tender')
@Controller('award-tender')
export class AwardTenderController {
  constructor(
    private readonly awardTenderService: AwardTenderService,
    private readonly tendersService: TendersService,
  ) {}

  @Get('/awards')
  @ApiOperation({
    summary: 'Search historical award notices from the last 3 years',
  })
  @ApiQuery({ type: AwardTenderAwardsRequestDto })
  @ApiOkResponse({ description: 'TED history awards search response' })
  @ApiBadRequestResponse({ description: 'Invalid award tender filters' })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async searchHistoryAwards(@Query() query: AwardTenderAwardsRequestDto) {
    return this.awardTenderService.searchHistoryAwards(query);
  }
}
