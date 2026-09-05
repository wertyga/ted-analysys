import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { DbCopyTechCron } from '@/resources/cron/db-copy-cron/db-copy.tech.cron';

@ApiTags('Admin Tech DB Copy')
@ApiBearerAuth()
@Controller('/adm/tech/db-copy')
@UseGuards(AdminAccessGuard)
export class DbCopyTechController {
  constructor(private readonly dbCopyTechCron: DbCopyTechCron) {}

  @ApiDefaultResponse({ description: 'Started database dump copy to CDN.' })
  @Post()
  copyDatabaseDumpToCdn() {
    return this.dbCopyTechCron.startCopyDatabaseDumpToCdn();
  }

  @ApiDefaultResponse({ description: 'Current database dump copy status.' })
  @Get('/status')
  getStatus() {
    return this.dbCopyTechCron.getStatus();
  }
}
