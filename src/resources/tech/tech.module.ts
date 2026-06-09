import { Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { DbCopyTechController } from './cron/db-copy.tech.controller';
import { DbCopyTechCron } from './cron/db-copy.tech.cron';
import { CpvAdmController } from './cpv/cpv.adm.controller';
import { CpvTechService } from './cpv/cpv.tech.service';
import { SitemapTechController } from './sitemap/sitemap.tech.controller';
import { SitemapTechService } from './sitemap/sitemap.tech.service';
import { TendersTechController } from './tenders/tenders.tech.controller';
import { TendersTechService } from './tenders/tenders.tech.service';

@Module({
  imports: [DeepSeekModule],
  controllers: [
    DbCopyTechController,
    SitemapTechController,
    TendersTechController,
    CpvAdmController,
  ],
  providers: [
    CpvTechService,
    DbCopyTechCron,
    SitemapTechService,
    TendersTechService,
  ],
})
export class TechModule {}
