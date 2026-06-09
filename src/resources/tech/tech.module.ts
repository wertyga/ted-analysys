import { Module } from '@nestjs/common';
import { CdnService } from '@/cdn';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { DbCopyTechCron } from './cron/db-copy.tech.cron';
import { CpvAdmController } from './cpv/cpv.adm.controller';
import { CpvTechService } from './cpv/cpv.tech.service';
import { SitemapTechController } from './sitemap/sitemap.tech.controller';
import { SitemapTechService } from './sitemap/sitemap.tech.service';
import { TendersTechController } from './tenders/tenders.tech.controller';
import { TendersTechService } from './tenders/tenders.tech.service';

@Module({
  imports: [DeepSeekModule],
  controllers: [SitemapTechController, TendersTechController, CpvAdmController],
  providers: [
    CdnService,
    CpvTechService,
    DbCopyTechCron,
    SitemapTechService,
    TendersTechService,
  ],
})
export class TechModule {}
