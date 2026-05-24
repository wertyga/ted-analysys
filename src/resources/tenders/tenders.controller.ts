import {
  Controller,
  forwardRef,
  Get,
  Inject,
  Param,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenderDetailDto, TenderDto } from './dto/tender.dto';
import { TendersService } from './tenders.service';
import { TenderModel } from './schemas';
import { TenderGeneralAnalysisModel } from '@/resources/tender-analysis/schemas';
import { TariffService } from '@/resources/tariff/tariff.service';
import { TariffType } from '@/resources/tariff/tariff.types';
import { TenderGeneralAnalysisService } from '@/resources/tender-analysis/tender-general-analysis.service';
import { TenderGeneralAnalysisDetailDto } from '@/resources/tender-analysis/dto/tender-general-analysis.dto';

@ApiTags('tenders')
@Controller('tenders')
export class TendersController {
  constructor(
    private readonly tendersService: TendersService,
    @Inject(TariffService)
    private readonly tariffService: TariffService,
    @Inject(forwardRef(() => TenderGeneralAnalysisService))
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get tender by local id or TED publication number' })
  @ApiOkResponse({ type: TenderDto })
  async findById(
    @Param('id') id: string,
    @Req() req,
  ): Promise<TenderDetailDto> {
    const tba = await this.tendersService.findByIdOrFetchFromTed(id);
    const tender = tba.toObject();

    const tenderSerialized = TenderModel.serializeDetail(tender);

    if (req.user) {
      await this.tendersService.fillUpTenderListByDeepAnalysisAndWishListStatus(
        [tenderSerialized],
        req.user._id.toString(),
      );
    }

    let generalAnalysis = TenderGeneralAnalysisModel.serializeDetail(
      tender.generalAnalysis,
    );
    const tariff = await this.tariffService.getUserTariff(req.user);

    if (tariff.type === TariffType.free) {
      generalAnalysis =
        this.tenderGeneralAnalysisService.filterFreeBasicAnalysisFields(
          generalAnalysis,
        ) as TenderGeneralAnalysisDetailDto;
    }

    return {
      ...tenderSerialized,
      generalAnalysis,
    };
  }
}
