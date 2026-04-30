import { Module } from '@nestjs/common';
import { TedSearchController } from './ted-search.controller';
import { TedSearchService } from './ted-search.service';

@Module({
  controllers: [TedSearchController],
  providers: [TedSearchService],
  exports: [TedSearchService],
})
export class TedSearchModule {}
