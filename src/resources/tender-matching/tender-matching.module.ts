import { Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { TariffModule } from '@/resources/tariff';
import { TenderMatchingService } from './tender-matching.service';
import { TenderMatchingController } from './tender-matching.controller';

@Module({
  imports: [DeepSeekModule, TariffModule],
  controllers: [TenderMatchingController],
  providers: [TenderMatchingService],
  exports: [TenderMatchingService],
})
export class TenderMatchingModule {}
