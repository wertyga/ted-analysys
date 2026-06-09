import { Module } from '@nestjs/common';
import { OpenAiModule } from '@/openai/openai.module';
import { CpvAdmController } from './cpv/cpv.adm.controller';
import { CpvTechService } from './cpv/cpv.tech.service';
import { SitemapTechController } from './sitemap/sitemap.tech.controller';
import { SitemapTechService } from './sitemap/sitemap.tech.service';
import { TendersTechController } from './tenders/tenders.tech.controller';
import { TendersTechService } from './tenders/tenders.tech.service';

@Module({
  imports: [OpenAiModule],
  controllers: [SitemapTechController, TendersTechController, CpvAdmController],
  providers: [CpvTechService, SitemapTechService, TendersTechService],
})
export class TechModule {}
