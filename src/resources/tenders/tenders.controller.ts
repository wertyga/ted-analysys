import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenderDto } from './dto/tender.dto';
import {
  TenderDocumentWithGeneralAnalysis,
  TendersService,
} from './tenders.service';
import { TenderGeneralAnalysisService } from '@/resources/tender-analysis/tender-general-analysis.service';

@ApiTags('tenders')
@Controller('tenders')
export class TendersController {
  constructor(
    private readonly tendersService: TendersService,
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get tender by local id or TED publication number' })
  @ApiOkResponse({ type: TenderDto })
  async findById(
    @Param('id') id: string,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    const tba = await this.tendersService.findByIdOrFetchFromTed(id);
    const tender = tba.toObject();

    return {
      ...this.tendersService.toDetailDto(tender),
      generalAnalysis: this.tenderGeneralAnalysisService.toDetailDto(
        tender.generalAnalysis,
      ),
    } as TenderDocumentWithGeneralAnalysis;
  }
}
