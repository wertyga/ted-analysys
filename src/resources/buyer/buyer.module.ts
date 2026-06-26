import { Module } from '@nestjs/common';
import { BuyerService } from './buyer.service';

@Module({
  imports: [],
  controllers: [],
  providers: [BuyerService],
  exports: [BuyerService],
})
export class BuyerModule {}
