import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  TenderSearchByCpvDto,
  TenderSearchDto,
} from './dto/tender-search.dto';
import { TenderDto, TenderSearchResponseDto } from './dto/tender.dto';
import { TendersService } from './tenders.service';

@ApiTags('tenders')
@Controller('tenders')
export class TendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Post('search')
  @ApiOperation({ summary: 'Search TED tenders and return normalized frontend DTOs' })
  @ApiBody({ type: TenderSearchDto })
  @ApiOkResponse({ type: TenderSearchResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid search input' })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async search(
    @Body() body: TenderSearchDto,
  ): Promise<TenderSearchResponseDto> {
    return this.tendersService.search(body);
  }

  @Post('search-by-cpv')
  @ApiOperation({ summary: 'Search TED tenders by CPV codes' })
  @ApiBody({ type: TenderSearchByCpvDto })
  @ApiOkResponse({ type: TenderSearchResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid CPV search input' })
  @ApiServiceUnavailableResponse({ description: 'TED API is unavailable' })
  async searchByCpv(
    @Body() body: TenderSearchByCpvDto,
  ): Promise<TenderSearchResponseDto> {
    return this.tendersService.searchByCpv(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Load a normalized tender from the local database' })
  @ApiParam({ name: 'id', example: '123456-2026' })
  @ApiQuery({ name: 'includeRaw', required: false, example: false })
  @ApiOkResponse({ type: TenderDto })
  @ApiNotFoundResponse({ description: 'Tender not found' })
  async findById(
    @Param('id') id: string,
    @Query('includeRaw') includeRaw?: string,
  ): Promise<TenderDto> {
    return this.tendersService.findById(id, includeRaw === 'true');
  }
}
