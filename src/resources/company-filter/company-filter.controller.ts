import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@/guards';
import { CompanyFilterService } from './company-filter.service';

@ApiTags('company-filter')
@ApiBearerAuth()
@UseGuards(AuthGuard)
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
  createCompanyFilter(@Req() req) {
    return this.companyFilterService.generateAnalysisForCompany(req.user);
  }

  @Post('confirm')
  @ApiOperation({
    summary: 'Confirm generated tender notification filters and run matching',
  })
  @ApiCreatedResponse({
    description: 'Confirmed company tender filter and saved tender matches.',
  })
  confirmCompanyFilter(@Req() req) {
    return this.companyFilterService.confirmCompanyTenderFilter(req.user);
  }
}
