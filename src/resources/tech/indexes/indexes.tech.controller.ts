import { Controller, Get, Post, UseGuards } from '@nestjs/common';
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
  syncIndexes() {
    return this.indexesTechService.startSyncIndexes();
  }

  @ApiDefaultResponse({ description: 'Current Mongo index synchronization status.' })
  @Get('/status')
  getSyncIndexesStatus() {
    return this.indexesTechService.getSyncIndexesStatus();
  }
}
