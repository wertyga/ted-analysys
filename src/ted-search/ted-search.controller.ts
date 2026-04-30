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
import { TedSearchRequestDto } from './dto/ted-search-request.dto';
import { TedSearchService } from './ted-search.service';
import {
  CpvCategoriesResponse,
  CpvCategorySyncResult,
} from './types/cpv-category.types';
import { TedScope, TedSearchResponse } from './types/ted-search.types';

@ApiTags('ted')
@Controller('ted')
export class TedSearchController {
  constructor(private readonly tedSearchService: TedSearchService) {}

  @Post('search')
  @ApiOperation({ summary: 'Raw TED Search API proxy for debugging' })
  @ApiBody({ type: TedSearchRequestDto })
  @ApiOkResponse({ description: 'Raw TED Search API response' })
  @ApiBadRequestResponse({ description: 'Invalid TED search request' })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async search(@Body() body: TedSearchRequestDto): Promise<TedSearchResponse> {
    return this.tedSearchService.searchNotices(body);
  }

  @Get('active-it')
  @ApiOperation({ summary: 'Raw TED search for active IT tenders' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'Raw TED Search API response' })
  @ApiBadRequestResponse({ description: 'Invalid limit' })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async activeIt(@Query('limit') limit?: string): Promise<TedSearchResponse> {
    return this.tedSearchService.searchActiveItTenders(
      this.parsePositiveInteger(limit, 'limit', 20),
    );
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

    return this.tedSearchService.searchByCpv(cpvCodes, {
      limit: this.parsePositiveInteger(limit, 'limit', 20),
      page: this.parsePositiveInteger(page, 'page', 1),
      scope: this.parseScope(scope),
    });
  }

  @Post('cpv-categories/update')
  @ApiOperation({ summary: 'Refresh CPV categories from the official TED codelist' })
  @ApiOkResponse({ description: 'CPV sync result' })
  @ApiServiceUnavailableResponse({ description: 'CPV codelist source is unavailable' })
  async updateCpvCategories(): Promise<CpvCategorySyncResult> {
    return this.tedSearchService.updateCpvCategories();
  }

  @Get('cpv-categories')
  @ApiOperation({ summary: 'List all CPV categories from the local database' })
  @ApiOkResponse({ type: CpvCategoriesResponse })
  async getCpvCategories(): Promise<CpvCategoriesResponse> {
    return this.tedSearchService.getCpvCategories();
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
