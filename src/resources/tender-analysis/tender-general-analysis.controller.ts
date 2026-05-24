import { Controller, Get, NotFoundException, Param, Req } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenderGeneralAnalysisDetailDto } from './dto/tender-general-analysis.dto';
import { TenderGeneralAnalysisService } from './tender-general-analysis.service';
import { TariffService, TariffType } from '@/resources/tariff';

@ApiTags('general-analysis')
@Controller('general-analysis')
export class TenderGeneralAnalysisController {
  constructor(
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
    private readonly tariffService: TariffService,
  ) {}

  @Get('tenders/:tenderId')
  @ApiOperation({ summary: 'Get general analysis by tender id' })
  @ApiOkResponse({ type: TenderGeneralAnalysisDetailDto })
  @ApiNotFoundResponse({ description: 'Tender general analysis not found' })
  async getByTenderId(
    @Param('tenderId') tenderId: string,
    @Req() req,
  ): Promise<TenderGeneralAnalysisDetailDto | null> {
    const analysis =
      await this.tenderGeneralAnalysisService.getDetailByTenderId(tenderId);

    if (analysis === null) {
      throw new NotFoundException(
        `General analysis for tender ${tenderId} not found`,
      );
    }

    const tariff = await this.tariffService.getUserTariff(req.user);

    if (!tariff.rules.basicAnalysis.enabled) {
      return null;
    }

    if (tariff.type === TariffType.free) {
      return this.tenderGeneralAnalysisService.filterFreeBasicAnalysisFields(
        analysis,
      ) as TenderGeneralAnalysisDetailDto;
    }

    return analysis;
  }
}
