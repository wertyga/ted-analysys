import { Module } from '@nestjs/common';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { TenderWishlistController } from './tender-wishlist.controller';
import { TenderWishlistService } from './tender-wishlist.service';

@Module({
  imports: [TendersModule],
  controllers: [TenderWishlistController],
  providers: [TenderWishlistService],
  exports: [TenderWishlistService],
})
export class TenderWishlistModule {}
