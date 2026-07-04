import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminAccessGuard } from '@/guards';
import { BuyerTechService } from '@/resources/tech/buyer/buyer.tech.service';

@Controller('/adm/tech/buyers')
@UseGuards(AdminAccessGuard)
export class BuyerTechController {
  constructor(private readonly buyerTechService: BuyerTechService) {}

  @Post('/collect')
  async collectBuyersFromTenders() {
    return this.buyerTechService.startCollectBuyersFromTenderAllAndUnsetTenderFields();
  }

  @Get('/collect/status')
  async getCollectBuyersFromTendersStatus() {
    return this.buyerTechService.getCollectBuyersFromTendersStatus();
  }

  @Post('/collect-awards')
  async collectBuyersFromAwardTenders() {
    return this.buyerTechService.startCollectBuyersFromAwardTenderAll();
  }

  @Get('/collect-awards/status')
  async getCollectBuyersFromAwardTendersStatus() {
    return this.buyerTechService.getCollectBuyersFromAwardTendersStatus();
  }
}
