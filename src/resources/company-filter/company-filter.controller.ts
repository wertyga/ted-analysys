import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TariffProGuard } from '@/guards';
import { CompanyFilterService } from './company-filter.service';
import { CompanyTenderFilterModel } from '@/resources/company-filter/company-filter.schema';

@ApiTags('company-filter')
@ApiBearerAuth()
@UseGuards(TariffProGuard)
@Controller('company-filter')
export class CompanyFilterController {
  constructor(private readonly companyFilterService: CompanyFilterService) {}

  @Post()
  @ApiOperation({
    summary: 'Generate and save tender notification filters for current user',
  })
  @ApiCreatedResponse({
    description: 'Generated company tender filter.',
  })
  async createCompanyFilter(@Req() req) {
    const data = await this.companyFilterService.generateAnalysisForCompany(
      req.user,
    );

    return CompanyTenderFilterModel.serializeDetail(data);
  }
}
