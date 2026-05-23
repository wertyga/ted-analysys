import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
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
import { TenderListDto } from '@/resources/tenders/dto/tender.dto';
import { AdminAccessGuard } from '@/guards';
import fs from 'node:fs';
import { TariffService } from '@/resources/tariff';

@ApiTags('ted')
@Controller('ted')
export class TedSearchController {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
    private readonly tariffService: TariffService,
  ) {}

  @UseGuards(AdminAccessGuard)
  @Post('/ted/search')
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
    const searchBody = await this.applySearchTariffRules(req.user, body);
    const noticeData = await this.tedSearchService.searchTenders({
      ...searchBody,
      noticeTypes: searchBody.noticeTypes ?? TENDER_COMPETITION_NOTICE_TYPES,
    });

    fs.writeFileSync('notice.json', JSON.stringify(noticeData));

    const tendersWithBaseAnalysis =
      await this.tendersService.upsertIfNeededMultipleTendersWithGeneralAnalysis(
        noticeData.notices ?? [],
      );

    const listTenders = tendersWithBaseAnalysis.map((tba) => {
      return this.tendersService.toWholeTenderListDto(tba);
    });

    if (req.user) {
      await this.tendersService.fillUpTenderListByDeepAnalysisAndWishListStatus(
        listTenders,
        req.user._id.toString(),
      );
    }

    return {
      ...noticeData,
      notices: listTenders,
    };
  }

  @Post(['search/local', 'search'])
  @ApiOperation({ summary: 'Search local tenders by structured filters' })
  @ApiBody({ type: TedTenderSearchRequestDto })
  @ApiOkResponse({ description: 'Local tenders search response' })
  async searchLocalTenders(
    @Req() req,
    @Body() body: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const searchBody = await this.applySearchTariffRules(req.user, body);
    const noticeData = await this.tedSearchService.searchLocalTenders({
      ...searchBody,
      noticeTypes: searchBody.noticeTypes ?? TENDER_COMPETITION_NOTICE_TYPES,
    });
    const localTenders = (noticeData.notices ?? []) as TenderListDto[];

    if (req.user) {
      await this.tendersService.fillUpTenderListByDeepAnalysisAndWishListStatus(
        localTenders,
        req.user._id.toString(),
      );
    }

    return {
      ...noticeData,
      notices: localTenders,
    };
  }

  private async applySearchTariffRules(
    user,
    body: TedTenderSearchRequestDto,
  ): Promise<TedTenderSearchRequestDto> {
    const tariff = await this.tariffService.getUserTariff(user);
    const maxResultsPerSearch = tariff.rules.search.maxResultsPerSearch;

    if (!maxResultsPerSearch) {
      return body;
    }

    return {
      ...body,
      limit: Math.min(body.limit ?? maxResultsPerSearch, maxResultsPerSearch),
    };
  }
}
