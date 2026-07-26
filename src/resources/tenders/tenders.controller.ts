import {
  Controller,
  forwardRef,
  Get,
  Inject,
  NotFoundException,
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
import { logger } from '@/utils';

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
    @Param('withBa') withBa: boolean,
    @Req() req,
  ): Promise<TenderDetailDto> {
    if (withBa) {
      await logger.info('findById::withBa', {
        userAgent: req.headers['user-agent'],
        withBa,
      });
    }

    const [tenderSerialized, tariff] = await Promise.all([
      this.tendersService
        .findById(id, withBa)
        .then((tender) =>
          tender ? TenderModel.serializeDetail(tender.toObject()) : null,
        ),
      withBa
        ? this.tariffService.getUserTariff(req.user)
        : { type: TariffType.free },
    ]);

    if (!tenderSerialized) {
      throw new NotFoundException(`Tender ${id} not found`);
    }

    if (req.user) {
      await this.tendersService.fillUpTenderListByDeepAnalysisAndWishListStatus(
        [tenderSerialized],
        req.user._id.toString(),
      );
    }

    let generalAnalysis = TenderGeneralAnalysisModel.serializeDetail(
      (tenderSerialized as any).generalAnalysis,
    );

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
