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
import { TenderWishlistService } from '@/resources/tender-wishlist/tender-wishlist.service';
import { TenderGeneralAnalysisModel } from '@/resources/tender-analysis/schemas';

@ApiTags('tenders')
@Controller('tenders')
export class TendersController {
  constructor(
    private readonly tendersService: TendersService,
    @Inject(forwardRef(() => TenderWishlistService))
    private readonly tenderWishlistService: TenderWishlistService,
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

    return {
      ...tenderSerialized,
      generalAnalysis: TenderGeneralAnalysisModel.serializeDetail(
        tender.generalAnalysis,
      ),
    };
  }
}
