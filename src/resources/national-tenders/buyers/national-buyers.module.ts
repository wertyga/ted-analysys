import { forwardRef, Module } from '@nestjs/common';
import { BuyerModule } from '@/resources/buyer/buyer.module';
import { NationalBuyersService } from './national-buyers.service';

/**
 * Buyers of national tenders live in the shared `buyers` collection.
 * Separate from `core` because `BuyerModule` depends (via tenders) on core.
 */
@Module({
  imports: [forwardRef(() => BuyerModule)],
  providers: [NationalBuyersService],
  exports: [NationalBuyersService],
})
export class NationalBuyersModule {}
