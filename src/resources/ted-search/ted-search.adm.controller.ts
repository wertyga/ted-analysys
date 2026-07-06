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
import { AdminAccessGuard } from '@/guards';
import { TenderNormalizerService } from '@/resources/tender-normalizer/tender-normalizer.service';
import { AwardTenderService } from '@/resources/award-tender/award-tender.service';
import { TendersService } from '@/resources/tenders/tenders.service';

@Controller('/ted/adm')
@UseGuards(AdminAccessGuard)
export class TedSearchAdminController {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tenderNormalizerService: TenderNormalizerService,
    private readonly awardTenderService: AwardTenderService,
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
  ): Promise<TedSearchResponse | any> {
    try {
      const noticeData = await this.tedSearchService.searchTenders({
        ...body,
        noticeTypes:
          body.noticeTypes !== null
            ? TENDER_COMPETITION_NOTICE_TYPES
            : undefined,
      });

      // this.tendersService.upsertTender(noticeData.notices[0]);
      // this.awardTenderService.upsertAwardTender(noticeData.notices[0]);

      return {
        ...noticeData,
        normalized: noticeData.notices.map((notice) =>
          this.tenderNormalizerService.normalizeTedNotice(notice),
        ),
      };
    } catch (e) {
      console.log({ e });
    }
  }
}
