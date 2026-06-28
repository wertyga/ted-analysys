import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BuyerIntelligenceService } from './buyer-intelligence.service';
import {
  BuyerIntelligenceDetailDto,
  BuyerIntelligenceModel,
} from './schemsa';

@ApiTags('buyer-intelligence')
@Controller('buyer-intelligence')
export class BuyerIntelligenceController {
  constructor(
    private readonly buyerIntelligenceService: BuyerIntelligenceService,
  ) {}

  @Get('buyers/:buyerId')
  @ApiOperation({ summary: 'Get buyer intelligence by buyer id' })
  @ApiOkResponse({ description: 'Buyer intelligence document' })
  async getByBuyerId(
    @Param('buyerId') buyerId: string,
  ): Promise<BuyerIntelligenceDetailDto | null> {
    const intelligence =
      await this.buyerIntelligenceService.ensureBuyerIntelligence({ buyerId });

    return BuyerIntelligenceModel.serializeDetail(intelligence);
  }
}
