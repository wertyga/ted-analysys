import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AwardTenderAwardsRequestDto } from './dto/award-tender-awards-request.dto';
import { AwardTenderService } from './award-tender.service';
import { TedSearchResponse } from '@/resources/ted-search/types/ted-search.types';
import { TendersService } from '@/resources/tenders/tenders.service';
import { AwardTenderModel } from '@/resources/award-tender/schemas';

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
  @ApiBody({ type: AwardTenderAwardsRequestDto })
  @ApiOkResponse({ description: 'TED history awards search response' })
  @ApiBadRequestResponse({ description: 'Invalid award tender filters' })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async searchHistoryAwards(
    @Query('tenderId') tenderId: string,
  ): Promise<TedSearchResponse | void> {
    // TODO
    // const tenderResponse =
    //   await this.awardTenderService.searchAwardsAndUpsertIfNeeded(
    //     tenderId,
    //   );
    //
    // return {
    //   totalNoticeCount: tenderResponse.totalNoticeCount,
    //   notices: tenderResponse.notices.map((tender) => {
    //     return AwardTenderModel.toDetailDto(tender);
    //   }),
    // };
  }
}
