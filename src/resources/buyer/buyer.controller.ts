import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { BuyerIntelligenceService } from '@/resources/buyer-intelligence';
import { BuyerIntelligenceModel } from '@/resources/buyer-intelligence/schemas';
import {
  BuyerListRequestDto,
  AwardTenderBuyerRequestDto,
} from './dto/buyer-list-request.dto';
import { BuyerModel } from './schemas';
import { BuyerService } from './buyer.service';
import { TariffService, TariffType } from '@/resources/tariff';

@ApiTags('buyers')
@Controller('buyers')
export class BuyerController {
  constructor(
    private readonly buyerService: BuyerService,
    private readonly buyerIntelligenceService: BuyerIntelligenceService,
    private readonly tariffService: TariffService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get buyers list' })
  @ApiQuery({ type: BuyerListRequestDto })
  @ApiOkResponse({ description: 'Buyer list.' })
  async getBuyers(@Query() query: BuyerListRequestDto) {
    const { totalCount, buyers } = await this.buyerService.getBuyers(query);

    return {
      totalCount,
      buyers: buyers.map(BuyerModel.serializePureList),
    };
  }

  @Get(':id/award-tenders')
  @ApiOperation({
    summary: 'Get award tenders by buyer id',
  })
  @ApiQuery({ type: AwardTenderBuyerRequestDto })
  @ApiOkResponse({ description: 'Buyer award tenders.' })
  getBuyerAwardTenders(
    @Param('id') id: string,
    @Query() query: AwardTenderBuyerRequestDto,
  ) {
    return this.buyerService.getAwardTendersByBuyerId(id, {
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('meta')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(10 * 60 * 1000)
  @ApiOperation({ summary: 'Get buyer filter metadata' })
  @ApiOkResponse({ description: 'Buyer metadata.' })
  getBuyerMeta() {
    return this.buyerService.getBuyerMeta();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get buyer details with buyer intelligence' })
  @ApiOkResponse({ description: 'Buyer details.' })
  async getBuyerById(@Param('id') id: string, @Req() req) {
    const buyer = await this.buyerService.getBuyerDetails(id);

    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    const tariffType = await this.tariffService.getUserTariffType(req.user);

    const promises: any[] = [
      this.buyerService.getRecentTenders(id),
      this.buyerService.getRecentAwardTenders(id),
    ];

    if (tariffType !== TariffType.free) {
      promises.push(
        this.buyerIntelligenceService.ensureBuyerIntelligence({
          buyerId: id,
        }),
      );
    }

    const [recentTenders, recentAwardTenders, buyerIntelligence] =
      await Promise.all(promises);

    const buyerIntel =
      BuyerIntelligenceModel.serializeDetail(buyerIntelligence);

    if (
      buyerIntel &&
      typeof buyerIntel === 'object' &&
      'buyer' in buyerIntelligence
    ) {
      // @ts-ignore
      delete buyerIntel.buyer;
    }

    return {
      buyer: BuyerModel.serializeDetail(buyer),
      buyerIntelligence: buyerIntel,
      recentTenders,
      recentAwardTenders,
    };
  }
}
