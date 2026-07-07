import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { IndexesTechService } from './indexes.tech.service';

@ApiTags('Admin Tech Indexes')
@ApiBearerAuth()
@Controller('/adm/tech/sync-indexes')
@UseGuards(AdminAccessGuard)
export class IndexesTechController {
  constructor(private readonly indexesTechService: IndexesTechService) {}

  @ApiDefaultResponse({ description: 'Started Mongo index synchronization.' })
  @Post()
  syncIndexes(@Query('force') force?: string) {
    return this.indexesTechService.startSyncIndexes(force === 'true');
  }

  @ApiDefaultResponse({ description: 'Current Mongo index synchronization status.' })
  @Get('/status')
  getSyncIndexesStatus() {
    return this.indexesTechService.getSyncIndexesStatus();
  }
}
