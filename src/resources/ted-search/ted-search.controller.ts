import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { TedSearchService } from './ted-search.service';
import { normalizeTenderSearchResponse } from './utils';
import { TedScope, TedSearchResponse } from './types/ted-search.types';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';

@ApiTags('ted')
@Controller('ted')
export class TedSearchController {
  constructor(private readonly tedSearchService: TedSearchService) {}

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

    return await normalizeTenderSearchResponse(data);
  }

  @Get('cpv')
  @ApiOperation({ summary: 'Raw TED search by CPV codes' })
  @ApiQuery({ name: 'codes', required: true, example: '72000000,48000000' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'scope', required: false, enum: TedScope })
  @ApiOkResponse({ description: 'Raw TED Search API response' })
  @ApiBadRequestResponse({ description: 'Invalid query input' })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async cpv(
    @Query('codes') codes: string | undefined,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('scope') scope?: string,
  ): Promise<TedSearchResponse> {
    const cpvCodes = this.parseCsv(codes, 'codes');

    const data = await this.tedSearchService.searchByCpv(cpvCodes, {
      limit: this.parsePositiveInteger(limit, 'limit', 20),
      page: this.parsePositiveInteger(page, 'page', 1),
      scope: this.parseScope(scope),
    });

    return await normalizeTenderSearchResponse(data);
  }

  private parseCsv(value: string | undefined, fieldName: string): string[] {
    if (!value) {
      throw new BadRequestException(`${fieldName} query parameter is required`);
    }

    const parsed = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (parsed.length === 0) {
      throw new BadRequestException(`${fieldName} query parameter is required`);
    }

    return parsed;
  }

  private parsePositiveInteger(
    value: string | undefined,
    fieldName: string,
    defaultValue: number,
  ): number {
    if (value === undefined) {
      return defaultValue;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new BadRequestException(
        `${fieldName} must be an integer between 1 and 100`,
      );
    }

    return parsed;
  }

  private parseScope(value: string | undefined): TedScope | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Object.values(TedScope).includes(value as TedScope)) {
      throw new BadRequestException(
        `scope must be one of: ${Object.values(TedScope).join(', ')}`,
      );
    }

    return value as TedScope;
  }
}
