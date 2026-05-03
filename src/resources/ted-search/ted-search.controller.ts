import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TedPublicationNumbersSearchRequestDto } from './dto/ted-publication-numbers-search-request.dto';
import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { TedSearchService } from './ted-search.service';
import { normalizeTenderSearchResponse } from './utils';
import { TedSearchResponse } from './types/ted-search.types';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { TenderGeneralAnalysisService } from '../tender-analysis/tender-general-analysis.service';

@ApiTags('ted')
@Controller('ted')
export class TedSearchController {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
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
    @Body() body: TedTenderSearchRequestDto,
  ): Promise<TedSearchResponse> {
    const updatedData = {
      ...body,
      noticeTypes: TENDER_COMPETITION_NOTICE_TYPES,
    };
    const data = await this.tedSearchService.searchTenders(updatedData);
    const normalized = await normalizeTenderSearchResponse(data);

    this.tenderGeneralAnalysisService.ensureBaseAnalysisForMultipleTenders(
      normalized.notices ?? [],
    );

    return normalized;
  }
}
