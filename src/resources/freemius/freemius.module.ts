import { Module } from '@nestjs/common';
import { FreemiusController } from './freemius.controller';
import { FreemiusService } from './freemius.service';

@Module({
  controllers: [FreemiusController],
  providers: [FreemiusService],
  exports: [FreemiusService],
})
export class FreemiusModule {}
