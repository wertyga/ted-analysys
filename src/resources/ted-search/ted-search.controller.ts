import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { TedSearchService } from './ted-search.service';
import { TedSearchResponse } from './types/ted-search.types';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderWishlistService } from '@/resources/tender-wishlist/tender-wishlist.service';
import { TenderListDto } from '@/resources/tenders/dto/tender.dto';

@ApiTags('ted')
@Controller('ted')
export class TedSearchController {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
    private readonly tenderWishlistService: TenderWishlistService,
  ) {}

  @Post('search')
  @ApiOperation({ summary: 'Search TED tenders by structured filters' })
  @ApiBody({ type: TedTenderSearchRequestDto })
  @ApiOkResponse({ description: 'TED Search API response' })
  @ApiBadRequestResponse({
    description: 'Invalid search filters or TED query syntax',
  })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async searchTenders(
    @Req() req,
    @Body() body: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const noticeData = await this.tedSearchService.searchTenders({
      ...body,
      noticeTypes: body.noticeTypes ?? TENDER_COMPETITION_NOTICE_TYPES,
    });

    const tendersWithBaseAnalysis =
      await this.tendersService.upsertIfNeededMultipleTendersWithGeneralAnalysis(
        noticeData.notices ?? [],
      );

    const listTenders = tendersWithBaseAnalysis.map((tba) => {
      return this.tendersService.toWholeTenderListDto(tba);
    });

    const tendersWithWishLists = req.user
      ? await this.tenderWishlistService.getPopulatedTendersByWishlists(
          listTenders,
          req.user._id.toString(),
        )
      : listTenders;

    return {
      ...noticeData,
      notices: tendersWithWishLists,
    };
  }

  @Post('search/local')
  @ApiOperation({ summary: 'Search local tenders by structured filters' })
  @ApiBody({ type: TedTenderSearchRequestDto })
  @ApiOkResponse({ description: 'Local tenders search response' })
  async searchLocalTenders(
    @Req() req,
    @Body() body: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const noticeData = await this.tedSearchService.searchLocalTenders({
      ...body,
      noticeTypes: body.noticeTypes ?? TENDER_COMPETITION_NOTICE_TYPES,
    });
    const localTenders = (noticeData.notices ?? []) as TenderListDto[];

    const tendersWithWishLists = req.user
      ? await this.tenderWishlistService.getPopulatedTendersByWishlists(
          localTenders,
          req.user._id.toString(),
        )
      : localTenders;

    return {
      ...noticeData,
      notices: tendersWithWishLists,
    };
  }
}
