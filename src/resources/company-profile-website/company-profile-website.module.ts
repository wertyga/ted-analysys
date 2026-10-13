import { Module } from '@nestjs/common';
import { LlmModule } from '@/llm/llm.module';
import { CpvModule } from '@/resources/cpv/cpv.module';
import { CompanyProfileWebsiteController } from './company-profile-website.controller';
import { CompanyProfileWebsiteService } from './company-profile-website.service';

@Module({
  imports: [LlmModule, CpvModule],
  controllers: [CompanyProfileWebsiteController],
  providers: [CompanyProfileWebsiteService],
})
export class CompanyProfileWebsiteModule {}
