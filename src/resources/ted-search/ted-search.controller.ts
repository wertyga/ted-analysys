import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { TedSearchService } from './ted-search.service';
import { TedSearchResponse } from './types/ted-search.types';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderListDto } from '@/resources/tenders/dto/tender.dto';
import { TariffService } from '@/resources/tariff';
import { UserDocument } from '@/resources/user/user.types';

@ApiTags('ted')
@Controller('ted')
export class TedSearchController {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
    private readonly tariffService: TariffService,
  ) {}

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
      withoutBaseAnalysisGenerating: !!req.isBot,
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
    user: UserDocument,
    body: TedTenderSearchRequestDto,
  ): Promise<TedTenderSearchRequestDto> {
    const tariff = await this.tariffService.getUserTariff(user);
    const maxResultsPerSearch = tariff.rules.search.maxResultsPerSearch;

    if (!maxResultsPerSearch) {
      return body;
    }

    const requestedLimit = body.limit ?? 20;

    const page = Math.min(
      body.page ?? 1,
      Math.ceil(maxResultsPerSearch / requestedLimit),
    );

    const limit = Math.min(
      requestedLimit,
      maxResultsPerSearch - (page - 1) * requestedLimit,
    );

    return {
      ...body,
      limit,
      page,
    };
  }
}
