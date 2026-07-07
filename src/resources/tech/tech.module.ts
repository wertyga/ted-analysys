import { Module } from '@nestjs/common';
import { LlmModule } from '@/llm/llm.module';
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
import { TenderGeneralAnalysisModule } from '@/resources/tender-analysis/tender-general-analysis.module';
import { BuyerTechService } from '@/resources/tech/buyer/buyer.tech.service';
import { BuyerModule } from '@/resources/buyer/buyer.module';
import { BuyerTechController } from '@/resources/tech/buyer/buyer.tech.controller';
import { TedOpenTendersCollectorModule } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.module';
import { IndexesTechController } from '@/resources/tech/indexes/indexes.tech.controller';
import { IndexesTechService } from '@/resources/tech/indexes/indexes.tech.service';
import { ContractorModule } from '@/resources/contractor/contractor.module';

@Module({
  imports: [
    LlmModule,
    DbCopyCronModule,
    AwardTenderModule,
    TedSearchModule,
    TendersModule,
    TenderGeneralAnalysisModule,
    TendersCronModule,
    BuyerModule,
    ContractorModule,
    TedOpenTendersCollectorModule,
  ],
  controllers: [
    AwardTendersTechController,
    ContractorsTechController,
    DbCopyTechController,
    SitemapTechController,
    TendersTechController,
    CpvAdmController,
    BuyerTechController,
    IndexesTechController,
  ],
  providers: [
    AwardTendersTechService,
    ContractorsTechService,
    CpvTechService,
    SitemapTechService,
    TendersTechService,
    BuyerTechService,
    IndexesTechService,
  ],
})
export class TechModule {}
