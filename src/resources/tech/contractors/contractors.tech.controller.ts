import { Controller, Post, UseGuards } from '@nestjs/common';
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
}
