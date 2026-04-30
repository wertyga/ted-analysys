import { Module } from '@nestjs/common';
import { CpvController } from './cpv.controller';
import { CpvService } from './cpv.service';

@Module({
  controllers: [CpvController],
  providers: [CpvService],
  exports: [CpvService],
})
export class CpvModule {}
