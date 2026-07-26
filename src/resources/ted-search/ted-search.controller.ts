import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { TedSearchService } from './ted-search.service';
import { TedSearchResponse } from './types/ted-search.types';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderListDto } from '@/resources/tenders/dto/tender.dto';
import { TariffService } from '@/resources/tariff';
import { UserDocument } from '@/resources/user/user.types';
import { TenderModel } from '@/resources/tenders/schemas';
import { TenderGeneralAnalysisService } from '@/resources/tender-analysis/tender-general-analysis.service';
import { TenderGeneralAnalysisModel } from '@/resources/tender-analysis/schemas';
import { logger } from '@/utils';

@ApiTags('ted')
@Controller('ted')
export class TedSearchController {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
    private readonly tariffService: TariffService,
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  @Get('/search-page')
  async searchTendersForSearchPage(
    @Query() query: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const { tenders, count } =
      await this.tedSearchService.searchTendersForPureList(query);

    const generalAnalysis = await this.tenderGeneralAnalysisService
      .ensureBaseAnalysisForMultipleTenders([tenders[0]])
      .then((analyses) => analyses[0]);

    return {
      notices: tenders.map(TenderModel.serializeList).map((t, i) => {
        if (t.id === generalAnalysis?.tenderId) {
          return {
            ...t,
            generalAnalysis:
              TenderGeneralAnalysisModel.serializeList(generalAnalysis),
          };
        }

        return t;
      }) as any,
      totalNoticeCount: count,
    };
  }

  @Get('/search-pure')
  @ApiOperation({ summary: 'Search local tenders by structured filters' })
  @ApiBody({ type: TedTenderSearchRequestDto })
  @ApiOkResponse({ description: 'Local tenders search response' })
  async searchLocalPureTenders(
    @Body() body: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const { tenders, count } =
      await this.tedSearchService.searchTendersForPureList(body);

    return {
      notices: tenders.map(TenderModel.serializeList),
      totalNoticeCount: count,
    };
  }

  @Post('/search')
  @ApiOperation({ summary: 'Search local tenders by structured filters' })
  @ApiBody({ type: TedTenderSearchRequestDto })
  @ApiOkResponse({ description: 'Local tenders search response' })
  async searchLocalTenders(
    @Req() req,
    @Body() body: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    if (!body.withoutBaseAnalysisGenerating) {
      await logger.info(
        'searchLocalTenders::body.withoutBaseAnalysisGenerating',
        {
          withoutBaseAnalysisGenerating: body.withoutBaseAnalysisGenerating,
          userAgent: req.headers['user-agent'],
        },
      );
    }

    const searchBody = await this.applySearchTariffRules(req.user, body);
    const noticeData = await this.tedSearchService.searchLocalTenders({
      ...searchBody,
      withoutBaseAnalysisGenerating:
        !!req.isBot || body.withoutBaseAnalysisGenerating,
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
