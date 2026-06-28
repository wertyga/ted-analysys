import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
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

@ApiTags('buyers')
@Controller('buyers')
export class BuyerController {
  constructor(
    private readonly buyerService: BuyerService,
    private readonly buyerIntelligenceService: BuyerIntelligenceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get buyers list' })
  @ApiQuery({ type: BuyerListRequestDto })
  @ApiOkResponse({ description: 'Buyer list.' })
  getBuyers(@Query() query: BuyerListRequestDto) {
    return this.buyerService.getBuyers(query);
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
  async getBuyerById(@Param('id') id: string) {
    const buyer = await this.buyerService.getBuyerDetails(id);

    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    const [buyerIntelligence, recentTenders, recentAwardTenders] =
      await Promise.all([
        this.buyerIntelligenceService.ensureBuyerIntelligence({
          buyerId: id,
        }),
        this.buyerService.getRecentTenders(id),
        this.buyerService.getRecentAwardTenders(id),
      ]);

    return {
      buyer: BuyerModel.serializeDetail(buyer),
      buyerIntelligence:
        BuyerIntelligenceModel.serializeDetail(buyerIntelligence),
      recentTenders,
      recentAwardTenders,
    };
  }
}
