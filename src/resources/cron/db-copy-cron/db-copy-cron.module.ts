import { Module } from '@nestjs/common';
import { DbCopyTechCron } from './db-copy.tech.cron';

@Module({
  providers: [DbCopyTechCron],
  exports: [DbCopyTechCron],
})
export class DbCopyCronModule {}
