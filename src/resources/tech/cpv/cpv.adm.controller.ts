import { Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { CpvCategorySlugSyncResult } from '@/resources/cpv/types';
import { CpvTechService } from './cpv.tech.service';

@ApiTags('Admin CPV')
@ApiBearerAuth()
@Controller('/cpv/adm')
@UseGuards(AdminAccessGuard)
export class CpvAdmController {
  constructor(private readonly cpvTechService: CpvTechService) {}

  @Post('/slugs')
  @ApiOperation({ summary: 'Generate CPV slugs from category names' })
  @ApiOkResponse({ description: 'CPV slug sync result.' })
  updateCpvCategorySlugs(): Promise<CpvCategorySlugSyncResult> {
    return this.cpvTechService.updateCpvCategorySlugs();
  }
}
