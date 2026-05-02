import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TenderDto } from './dto/tender.dto';
import { TendersService } from './tenders.service';

@ApiTags('tenders')
@Controller('tenders')
export class TendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get tender by local id or TED publication number' })
  @ApiQuery({ name: 'includeRaw', required: false, example: false })
  @ApiOkResponse({ type: TenderDto })
  async findById(
    @Param('id') id: string,
    @Query('includeRaw') includeRaw?: string | boolean,
  ): Promise<TenderDto> {
    return this.tendersService.findById(
      id,
      includeRaw === true || includeRaw === 'true',
    );
  }
}
