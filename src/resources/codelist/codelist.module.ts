import { Module } from '@nestjs/common';
import { CodelistController } from './codelist.controller';
import { CodelistService } from './codelist.service';

@Module({
  controllers: [CodelistController],
  providers: [CodelistService],
  exports: [CodelistService],
})
export class CodelistModule {}
