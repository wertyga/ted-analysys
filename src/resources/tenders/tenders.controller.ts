import { Controller, forwardRef, Get, Inject, Param, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenderDto } from './dto/tender.dto';
import {
  TenderDocumentWithGeneralAnalysis,
  TendersService,
} from './tenders.service';
import { TenderGeneralAnalysisService } from '@/resources/tender-analysis/tender-general-analysis.service';
import { TenderWishlistService } from '@/resources/tender-wishlist/tender-wishlist.service';

@ApiTags('tenders')
@Controller('tenders')
export class TendersController {
  constructor(
    private readonly tendersService: TendersService,
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
    @Inject(forwardRef(() => TenderWishlistService))
    private readonly tenderWishlistService: TenderWishlistService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get tender by local id or TED publication number' })
  @ApiOkResponse({ type: TenderDto })
  async findById(
    @Param('id') id: string,
    @Req() req,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    const tba = await this.tendersService.findByIdOrFetchFromTed(id);
    const tender = tba.toObject();
    const wishlistStatus = req.user
      ? await this.tenderWishlistService.getTenderStatus(req.user, tender.id)
      : undefined;

    return {
      ...this.tendersService.toDetailDto(tender),
      ...(wishlistStatus
        ? { isInWishlist: wishlistStatus.isInWishlist }
        : undefined),
      generalAnalysis: this.tenderGeneralAnalysisService.toDetailDto(
        tender.generalAnalysis,
      ),
    } as TenderDocumentWithGeneralAnalysis;
  }
}
