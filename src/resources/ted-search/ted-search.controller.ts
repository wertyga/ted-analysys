import {
  Body,
  Controller,
  forwardRef,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
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
import { normalizeTenderSearchResponse, resolveDeadlineRange } from './utils';
import { TedSearchResponse } from './types/ted-search.types';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { TenderGeneralAnalysisService } from '../tender-analysis/tender-general-analysis.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderWishlistService } from '@/resources/tender-wishlist/tender-wishlist.service';

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

    const [tendersWithBaseAnalysis] = await Promise.all([
      this.tendersService.upsertIfNeededMultipleTendersWithGeneralAnalysis(
        noticeData.notices ?? [],
      ),
    ]);

    const listTenders = tendersWithBaseAnalysis.map((tba) => {
      const tender = 'toObject' in tba ? tba.toObject() : tba;

      return this.tendersService.toWholeTenderListDto(tender);
    });

    const normalized = await normalizeTenderSearchResponse({
      ...noticeData,
      notices: req.user
        ? await this.tenderWishlistService.getPopulatedTendersByWishlists(
            listTenders,
            req.user._id.toString(),
          )
        : listTenders,
    });

    return normalized;
  }
}
