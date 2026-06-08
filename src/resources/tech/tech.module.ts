import { Module } from '@nestjs/common';
import { TechController } from './tech.controller';
import { TechService } from './tech.service';
import { SitemapsController } from './sitemaps.controller';

@Module({
  controllers: [TechController, SitemapsController],
  providers: [TechService],
})
export class TechModule {}
