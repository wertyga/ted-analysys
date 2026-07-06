import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { ContractorsTechService } from './contractors.tech.service';

@ApiTags('Admin Tech Contractors')
@ApiBearerAuth()
@Controller('/adm/tech/contractors')
@UseGuards(AdminAccessGuard)
export class ContractorsTechController {
  constructor(
    private readonly contractorsTechService: ContractorsTechService,
  ) {}

  @ApiDefaultResponse({ description: 'Generated contractors CSV file.' })
  @Post('/csv')
  generateContractorsCsv() {
    return this.contractorsTechService.generateContractorsCsv();
  }

  @ApiDefaultResponse({ description: 'Compressed contractors by email.' })
  @Post('/compress')
  compressContractors() {
    return this.contractorsTechService.compressContractors();
  }

  @ApiDefaultResponse({
    description: 'Current contractor stats refresh status.',
  })
  @Get('/refresh-stats/status')
  getRefreshContractorStatsStatus() {
    return this.contractorsTechService.getRefreshContractorStatsStatus();
  }

  @ApiDefaultResponse({
    description: 'Started contractor stats refresh from saved award tenders.',
  })
  @Post('/refresh-stats')
  refreshContractorStats() {
    return this.contractorsTechService.startRefreshContractorStats();
  }
}
