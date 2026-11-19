import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import {
  TedSearchService,
  TENDER_SEARCH_PURE_RESPONSE_SELECT,
} from './ted-search.service';
import { TedSearchResponse } from './types/ted-search.types';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderListDto } from '@/resources/tenders/dto/tender.dto';
import { TariffService } from '@/resources/tariff';
import { UserDocument } from '@/resources/user/user.types';
import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import { TenderGeneralAnalysisService } from '@/resources/tender-analysis/tender-general-analysis.service';
import { TenderGeneralAnalysisModel } from '@/resources/tender-analysis/schemas';
import { logger } from '@/utils';
import { isPageIndexable } from '@/resources/seo/page-indexability';
import { isNationalTenderId } from '@/resources/national-tenders/core/national-tender.serializer';

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

    // National records come serialized; analyses need their adapted form.
    const first = tenders[0];
    const firstForAnalysis =
      first && isNationalTenderId(first.id)
        ? await this.tendersService.findLocalOrNationalTender(first.id)
        : first;
    const generalAnalysis = firstForAnalysis
      ? await this.tenderGeneralAnalysisService
          .ensureBaseAnalysisForMultipleTenders([
            firstForAnalysis,
          ] as unknown as TenderDocument[])
          .then((analyses) => analyses[0])
      : undefined;

    return {
      notices: tenders
        .map((tender) =>
          isNationalTenderId(tender.id)
            ? (tender as unknown as { id: string })
            : TenderModel.serializeList(tender),
        )
        .map((t) => {
          if (t.id === generalAnalysis?.tenderId) {
            return {
              ...t,
              generalAnalysis:
                TenderGeneralAnalysisModel.serializeList(generalAnalysis),
            };
          }

          return t;
        }),
      totalNoticeCount: count,
    };
  }

  @Post('/search-pure')
  @ApiOperation({ summary: 'Search local tenders by structured filters' })
  @ApiBody({ type: TedTenderSearchRequestDto })
  @ApiOkResponse({ description: 'Local tenders search response' })
  async searchLocalPureTenders(
    @Body() body: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const [{ tenders, count }, indexable] = await Promise.all([
      this.tedSearchService.searchTendersForPureList(
        body,
        TENDER_SEARCH_PURE_RESPONSE_SELECT,
      ),
      isPageIndexable({
        cpvCodes: body.cpvCodes,
        placeOfPerformance: body.placeOfPerformance,
      }),
    ]);

    return {
      notices: tenders as unknown as TedSearchResponse['notices'],
      totalNoticeCount: count,
      indexable,
    };
  }

  // @Post('/search-pure-expired')
  // @ApiOperation({ summary: 'Search local tenders by structured filters' })
  // @ApiBody({ type: TedTenderSearchRequestDto })
  // @ApiOkResponse({ description: 'Local tenders search response' })
  // async searchLocalPureExpiredTenders(
  //   @Body() body: TedTenderSearchRequestDto,
  // ): Promise<TedSearchResponse> {
  //   const { tenders, count } =
  //     await this.tedSearchService.searchTendersForPureList(body);
  //
  //   return {
  //     notices: tenders.map(TenderModel.serializeList),
  //     totalNoticeCount: count,
  //   };
  // }

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
