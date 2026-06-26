import { Controller, Post, UseGuards } from '@nestjs/common';
import { AdminAccessGuard } from '@/guards';
import { BuyerTechService } from '@/resources/tech/buyer/buyer.tech.service';

@Controller('/adm/tech/buyers')
@UseGuards(AdminAccessGuard)
export class BuyerTechController {
  constructor(private readonly buyerTechService: BuyerTechService) {}

  @Post('/collect')
  async collectBuyersFromTenders() {
    return this.buyerTechService.collectBuyersFromTenderAllAndUnsetTenderFields();
  }
}
