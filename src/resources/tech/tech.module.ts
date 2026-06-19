import { Module } from '@nestjs/common';
import { DeepSeekModule } from '@/deepseek/deepseek.module';
import { DbCopyTechController } from './cron/db-copy.tech.controller';
import { DbCopyCronModule } from '@/resources/cron/db-copy-cron/db-copy-cron.module';
import { ContractorsTechController } from './contractors/contractors.tech.controller';
import { ContractorsTechService } from './contractors/contractors.tech.service';
import { CpvAdmController } from './cpv/cpv.adm.controller';
import { CpvTechService } from './cpv/cpv.tech.service';
import { SitemapTechController } from './sitemap/sitemap.tech.controller';
import { SitemapTechService } from './sitemap/sitemap.tech.service';
import { TendersTechController } from './tenders/tenders.tech.controller';
import { TendersTechService } from './tenders/tenders.tech.service';
import { AwardTendersTechController } from './award-tenders/award-tenders.tech.controller';
import { AwardTendersTechService } from './award-tenders/award-tenders.tech.service';
import { AwardTenderModule } from '@/resources/award-tender/award-tender.module';
import { TedSearchModule } from '@/resources/ted-search/ted-search.module';
import { TendersModule } from '@/resources/tenders/tenders.module';
import { TendersCronModule } from '@/resources/cron/tenders-cron/tenders-cron.module';

@Module({
  imports: [
    DeepSeekModule,
    DbCopyCronModule,
    AwardTenderModule,
    TedSearchModule,
    TendersModule,
    TendersCronModule,
  ],
  controllers: [
    AwardTendersTechController,
    ContractorsTechController,
    DbCopyTechController,
    SitemapTechController,
    TendersTechController,
    CpvAdmController,
  ],
  providers: [
    AwardTendersTechService,
    ContractorsTechService,
    CpvTechService,
    SitemapTechService,
    TendersTechService,
  ],
})
export class TechModule {}
