import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { TedSearchService } from './ted-search.service';
import { TedSearchResponse } from './types/ted-search.types';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { TendersService } from '@/resources/tenders/tenders.service';
import { AdminAccessGuard } from '@/guards';
import { getEngValueOrFirst } from '@/utils';
import { extractLotWinnersFromXml } from '@/resources/award-tender/utils';
import fs from 'node:fs';

@Controller('/ted/adm')
@UseGuards(AdminAccessGuard)
export class TedSearchAdminController {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
  ) {}

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
    const noticeData = await this.tedSearchService.searchTenders({
      ...body,
      noticeTypes:
        body.noticeTypes !== null ? TENDER_COMPETITION_NOTICE_TYPES : undefined,
    });

    const c = await extractLotWinnersFromXml(noticeData.notices[0].links);
    fs.writeFileSync('winners-lot-from-xml.json', JSON.stringify(c));

    // const tendersWithBaseAnalysis =
    //   await this.tendersService.upsertIfNeededMultipleTendersWithGeneralAnalysis(
    //     noticeData.notices ?? [],
    //   );
    //
    // const listTenders = tendersWithBaseAnalysis.map((tba) => {
    //   return this.tendersService.toWholeTenderListDto(tba);
    // });
    //
    // if (req.user) {
    //   await this.tendersService.fillUpTenderListByDeepAnalysisAndWishListStatus(
    //     listTenders,
    //     req.user._id.toString(),
    //   );
    // }

    return noticeData;
  }
}
