import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenderGeneralAnalysisDetailDto } from './dto/tender-general-analysis.dto';
import { TenderGeneralAnalysisService } from './tender-general-analysis.service';

@ApiTags('general-analysis')
@Controller('general-analysis')
export class TenderGeneralAnalysisController {
  constructor(
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  @Get('tenders/:tenderId')
  @ApiOperation({ summary: 'Get general analysis by tender id' })
  @ApiOkResponse({ type: TenderGeneralAnalysisDetailDto })
  @ApiNotFoundResponse({ description: 'Tender general analysis not found' })
  async getByTenderId(
    @Param('tenderId') tenderId: string,
  ): Promise<TenderGeneralAnalysisDetailDto> {
    const analysis =
      await this.tenderGeneralAnalysisService.getDetailByTenderId(tenderId);

    if (analysis === null) {
      throw new NotFoundException(
        `General analysis for tender ${tenderId} not found`,
      );
    }

    return analysis;
  }
}
