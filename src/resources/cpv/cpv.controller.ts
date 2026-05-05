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
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CpvCategoriesResponse, CpvCategorySyncResult } from './types';
import { CpvService } from './cpv.service';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

class CpvDescendantsRequestDto {
  @ApiProperty({ type: [String], example: ['72000000', '48000000'] })
  @IsArray()
  @IsString({ each: true })
  codes!: string[];
}

@ApiTags('cpv')
@Controller('cpv')
export class CpvController {
  constructor(private readonly cpvService: CpvService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search CPV codes by code or label' })
  @ApiQuery({ name: 'q', required: false, example: 'software' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ type: CpvCategoriesResponse })
  @ApiBadRequestResponse({ description: 'Invalid limit' })
  async search(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<CpvCategoriesResponse> {
    const parsedLimit = this.parseLimit(limit, 20);

    return this.cpvService.search(q ?? '', parsedLimit);
  }

  @Get('cpv-categories')
  @ApiOperation({ summary: 'List all CPV categories from the local database' })
  @ApiOkResponse({ type: CpvCategoriesResponse })
  async getCpvCategories(): Promise<CpvCategoriesResponse> {
    return this.cpvService.getCpvCategories();
  }

  @Get('industries')
  @ApiOperation({ summary: 'List CPV industry codes with level 2' })
  @ApiOkResponse({ type: CpvCategoriesResponse })
  async getIndustries(): Promise<CpvCategoriesResponse> {
    return this.cpvService.getIndustries();
  }

  @Post('descendants')
  @ApiOperation({
    summary: 'List child CPV categories for the given CPV codes',
  })
  @ApiOkResponse({ type: CpvCategoriesResponse })
  @ApiBadRequestResponse({ description: 'Invalid CPV codes payload' })
  async getDescendants(
    @Body() { codes }: CpvDescendantsRequestDto,
  ): Promise<CpvCategoriesResponse> {
    return this.cpvService.findDescendants(codes);
  }

  // TODO: AdminGuard
  @Post('update')
  @ApiOperation({
    summary: 'Refresh CPV categories from the official TED codelist',
  })
  @ApiOkResponse({ description: 'CPV sync result' })
  @ApiServiceUnavailableResponse({
    description: 'CPV codelist source is unavailable',
  })
  async updateCpvCategories(): Promise<CpvCategorySyncResult> {
    return this.cpvService.updateCpvCategories();
  }

  private parseLimit(value: string | undefined, defaultValue: number): number {
    if (value === undefined) {
      return defaultValue;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }

    return parsed;
  }
}
