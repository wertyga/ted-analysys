import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ContractorService } from './contractor.service';
import { ContractorListRequestDto } from './dto/contractor-list-request.dto';
import { ContractorSearchRequestDto } from './dto/contractor-search-request.dto';

@ApiTags('contractors')
@Controller('contractors')
export class ContractorController {
  constructor(private readonly contractorService: ContractorService) {}

  @Get()
  @ApiOperation({ summary: 'Search contractors by CPV codes and countries' })
  @ApiQuery({ type: ContractorListRequestDto })
  @ApiOkResponse({ description: 'Contractor list.' })
  searchContractors(@Query() query: ContractorListRequestDto) {
    return this.contractorService.searchContractors(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search contractors by text query' })
  @ApiQuery({ type: ContractorSearchRequestDto })
  @ApiOkResponse({ description: 'Contractor search result.' })
  searchContractorsByQuery(@Query() query: ContractorSearchRequestDto) {
    return this.contractorService.searchContractorsByQuery(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get contractor collection stats' })
  @ApiOkResponse({ description: 'Contractor stats.' })
  getContractorStats() {
    return this.contractorService.getContractorStats();
  }
}
