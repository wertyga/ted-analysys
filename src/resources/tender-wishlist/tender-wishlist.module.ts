import { forwardRef, Module } from '@nestjs/common';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { TariffModule } from '@/resources/tariff';
import { TenderWishlistController } from './tender-wishlist.controller';
import { TenderWishlistService } from './tender-wishlist.service';

@Module({
  imports: [forwardRef(() => TendersModule), TariffModule],
  controllers: [TenderWishlistController],
  providers: [TenderWishlistService],
  exports: [TenderWishlistService],
})
export class TenderWishlistModule {}
