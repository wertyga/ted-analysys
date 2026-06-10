import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { DbCopyTechCron } from './db-copy.tech.cron';

@ApiTags('Admin Tech DB Copy')
@ApiBearerAuth()
@Controller('/adm/tech/db-copy')
@UseGuards(AdminAccessGuard)
export class DbCopyTechController {
  constructor(private readonly dbCopyTechCron: DbCopyTechCron) {}

  @ApiDefaultResponse({ description: 'Created database dump copy on CDN.' })
  @Post()
  copyDatabaseDumpToCdn() {
    return this.dbCopyTechCron.copyDatabaseDumpToCdn();
  }
}
