import {
  Body,
  Controller,
  forwardRef,
  Get,
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
import { TED_ELIGIBLE_COUNTRIES } from './utils';
import { TenderWishlistService } from '@/resources/tender-wishlist/tender-wishlist.service';

interface TedCountryResponse {
  code: string;
  name: string;
}

@ApiTags('ted')
@Controller('ted')
export class TedSearchController {
  constructor(
    private readonly tedSearchService: TedSearchService,
    @Inject(forwardRef(() => TenderGeneralAnalysisService))
    @Inject(forwardRef(() => TendersService))
    private readonly tendersService: TendersService,
    private readonly tenderWishlistService: TenderWishlistService,
  ) {}

  @Get('countries')
  @ApiOperation({ summary: 'Get TED eligible countries for frontend filters' })
  @ApiOkResponse({ description: 'List of TED country codes and names' })
  getCountries(): TedCountryResponse[] {
    return Object.entries(TED_ELIGIBLE_COUNTRIES)
      .map(([code, name]) => ({ code, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

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
    const resolvedDateSinceTodayFilters = resolveDeadlineRange({
      ...body,
      noticeTypes: body.noticeTypes ?? TENDER_COMPETITION_NOTICE_TYPES,
    });

    const noticeData = await this.tedSearchService.searchTenders(
      resolvedDateSinceTodayFilters,
    );

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
