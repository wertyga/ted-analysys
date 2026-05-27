import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SimilarContractAwardsRequestDto } from './dto/similar-contract-awards-request.dto';
import { SimilarContractsService } from './similar-contracts.service';
import { TedSearchResponse } from '@/resources/ted-search/types/ted-search.types';
import { TendersService } from '@/resources/tenders/tenders.service';
import { AwardTenderModel } from '@/resources/similar-contracts/schemas';

@ApiTags('similar-contracts')
@Controller('similar-contracts')
export class SimilarContractsController {
  constructor(
    private readonly similarContractsService: SimilarContractsService,
    private readonly tendersService: TendersService,
  ) {}

  @Get('/awards')
  @ApiOperation({
    summary: 'Search similar historical award notices from the last 3 years',
  })
  @ApiBody({ type: SimilarContractAwardsRequestDto })
  @ApiOkResponse({ description: 'TED history awards search response' })
  @ApiBadRequestResponse({ description: 'Invalid similar contracts filters' })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async searchHistoryAwards(
    @Query('tenderId') tenderId: string,
  ): Promise<TedSearchResponse> {
    const tenderResponse =
      await this.similarContractsService.searchAwardsAndUpsertIfNeeded(
        tenderId,
      );

    return {
      totalNoticeCount: tenderResponse.totalNoticeCount,
      notices: tenderResponse.notices.map((tender) => {
        return AwardTenderModel.toDetailDto(tender);
      }),
    };
  }
}
