import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AwardTenderAwardsRequestDto } from './dto/award-tender-awards-request.dto';
import { AwardTenderPureSearchRequestDto } from './dto/award-tender-pure-search-request.dto';
import {
  AwardTenderFiltersRequestDto,
  AwardTenderListRequestDto,
} from './dto/award-tender-list-request.dto';
import { AwardTenderService } from './award-tender.service';
import { AwardTenderDetailDto } from './schemas';

@ApiTags('award-tender')
@Controller('awards')
export class AwardTenderController {
  constructor(private readonly awardTenderService: AwardTenderService) {}

  @Get()
  @ApiOperation({ summary: 'List award tenders with filters and sorting' })
  @ApiQuery({ type: AwardTenderListRequestDto })
  @ApiOkResponse({ description: 'Paginated award tenders list' })
  @ApiBadRequestResponse({ description: 'Invalid award filters' })
  async listAwards(@Query() query: AwardTenderListRequestDto) {
    return this.awardTenderService.listAwards(query);
  }

  @Get('/stats')
  @ApiOperation({ summary: 'Aggregate stats for award tenders' })
  @ApiQuery({ type: AwardTenderFiltersRequestDto })
  @ApiOkResponse({ description: 'Award tenders stats' })
  @ApiBadRequestResponse({ description: 'Invalid award filters' })
  async getAwardsStats(@Query() query: AwardTenderFiltersRequestDto) {
    return this.awardTenderService.getAwardsStats(query);
  }

  @Get('/search')
  @ApiOperation({
    summary: 'Search historical award tenders',
  })
  @ApiQuery({ type: AwardTenderAwardsRequestDto })
  @ApiOkResponse({ description: 'TED history awards search response' })
  @ApiBadRequestResponse({ description: 'Invalid award tender filters' })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async searchHistoryAwards(@Query() query: AwardTenderAwardsRequestDto) {
    return this.awardTenderService.searchAwardTendersLocal(query.tenderId, {
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('/search-pure')
  @ApiOperation({
    summary: 'List historical award tenders with minimal fields',
  })
  @ApiQuery({ type: AwardTenderPureSearchRequestDto })
  @ApiOkResponse({ description: 'TED history awards pure search response' })
  @ApiBadRequestResponse({ description: 'Invalid pagination parameters' })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async searchHistoryAwardsPure(
    @Query() query: AwardTenderPureSearchRequestDto,
  ) {
    return this.awardTenderService.searchAwardTendersLocalPure(
      {
        cpvCodes: query.cpvCodes,
        placeOfPerformance: query.placeOfPerformance,
        contractNature: query.contractNature,
        procedureType: query.procedureType,
        awardDateFrom: query.awardDateFrom,
      },
      {
        page: query.page,
        limit: query.limit,
      },
    );
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get award tender by publication number' })
  @ApiOkResponse({ description: 'Award tender detail.' })
  async getAwardTenderById(
    @Param('id') id: string,
  ): Promise<AwardTenderDetailDto> {
    return this.awardTenderService.getAwardTenderById(id);
  }
}
