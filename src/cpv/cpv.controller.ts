import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CpvCategoriesResponse } from '../ted-search/types/cpv-category.types';
import { CpvService } from './cpv.service';

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

  @Get('popular')
  @ApiOperation({ summary: 'List popular top-level CPV categories' })
  @ApiOkResponse({ type: CpvCategoriesResponse })
  async popular(): Promise<CpvCategoriesResponse> {
    return this.cpvService.popular();
  }

  private parseLimit(value: string | undefined, defaultValue: number): number {
    if (value === undefined) {
      return defaultValue;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }

    return parsed;
  }
}
