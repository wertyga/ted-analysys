import {
  Controller,
  forwardRef,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
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
import { isTenderIndexable } from '@/resources/seo/page-indexability';
import {
  isNationalTenderId,
  NationalTenderDetailDto,
  NationalTendersReadService,
} from '@/resources/national-tenders/core/national-tenders-read.service';
import {
  findProcedureAward,
  ProcedureAwardDto,
} from '@/resources/award-tender/procedure-award';

type WithAward = { indexable: boolean; award: ProcedureAwardDto | null };

@ApiTags('tenders')
@Controller('tenders')
export class TendersController {
  constructor(
    private readonly tendersService: TendersService,
    @Inject(TariffService)
    private readonly tariffService: TariffService,
    @Inject(forwardRef(() => TenderGeneralAnalysisService))
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
    private readonly nationalTendersReadService: NationalTendersReadService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get tender by local id or TED publication number' })
  @ApiOkResponse({ type: TenderDto })
  async findById(
    @Param('id') id: string,
    @Query('withGA') withGA: boolean,
    @Req() req,
  ): Promise<(TenderDetailDto | NationalTenderDetailDto) & WithAward> {
    const withoutBaseAnalysisGenerating = !withGA || req.isBot;

    if (isNationalTenderId(id)) {
      return this.findNationalById(id, withoutBaseAnalysisGenerating, req);
    }

    const [tenderSerialized, tariff] = await Promise.all([
      this.tendersService
        .findById(id, withoutBaseAnalysisGenerating)
        .then((tender) => {
          return tender ? TenderModel.serializeDetail(tender.toObject()) : null;
        }),
      withoutBaseAnalysisGenerating
        ? { type: TariffType.free }
        : this.tariffService.getUserTariff(req.user),
    ]);

    if (!tenderSerialized) {
      throw new NotFoundException(`Tender ${id} not found`);
    }

    const [award] = await Promise.all([
      findProcedureAward({
        source: 'TED',
        procedureId: tenderSerialized.procedureId,
      }),
      req.user
        ? this.tendersService.fillUpTenderListByDeepAnalysisAndWishListStatus(
            [tenderSerialized],
            String(req.user._id),
          )
        : undefined,
    ]);

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
      indexable: isTenderIndexable(tenderSerialized),
      award,
    };
  }

  /** National (non-TED) tender, served in the TenderDto shape. */
  private async findNationalById(
    id: string,
    withoutBaseAnalysisGenerating: boolean,
    req,
  ): Promise<NationalTenderDetailDto & WithAward> {
    const tender = await this.nationalTendersReadService.findById(id);

    if (!tender) {
      throw new NotFoundException(`Tender ${id} not found`);
    }

    const [analysis, tariff, award] = await Promise.all([
      withoutBaseAnalysisGenerating
        ? TenderGeneralAnalysisModel.findOne({ tenderId: id }).lean()
        : this.nationalTendersReadService
            .findAnalysisTender(id)
            .then((analysisTender) =>
              this.tenderGeneralAnalysisService.ensureAnalysisForTender(
                analysisTender!,
              ),
            ),
      withoutBaseAnalysisGenerating
        ? { type: TariffType.free }
        : this.tariffService.getUserTariff(req.user),
      findProcedureAward({
        source: tender.source,
        procedureId: tender.sourceProcedureId,
      }),
    ]);

    let generalAnalysis = analysis
      ? TenderGeneralAnalysisModel.serializeDetail(analysis)
      : undefined;

    if (generalAnalysis && tariff.type === TariffType.free) {
      generalAnalysis =
        this.tenderGeneralAnalysisService.filterFreeBasicAnalysisFields(
          generalAnalysis,
        ) as TenderGeneralAnalysisDetailDto;
    }

    const detail = this.nationalTendersReadService.serializeDetail(tender);

    if (req.user) {
      await this.tendersService.fillUpTenderListByDeepAnalysisAndWishListStatus(
        [detail],
        String(req.user._id),
      );
    }

    return {
      ...detail,
      generalAnalysis,
      indexable: isTenderIndexable(detail),
      award,
    } as NationalTenderDetailDto & WithAward;
  }
}
