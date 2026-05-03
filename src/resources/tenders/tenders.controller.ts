import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenderDto } from './dto/tender.dto';
import {
  TenderDocumentWithGeneralAnalysis,
  TendersService,
} from './tenders.service';

@ApiTags('tenders')
@Controller('tenders')
export class TendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get tender by local id or TED publication number' })
  @ApiOkResponse({ type: TenderDto })
  async findById(
    @Param('id') id: string,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    return this.tendersService.findByIdOrFetchFromTed(id);
  }
}
