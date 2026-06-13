import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ContractorService } from './contractor.service';
import { ContractorListRequestDto } from './dto/contractor-list-request.dto';

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

  @Get('identifier/:identifier')
  @ApiOperation({ summary: 'Get contractor by identifier' })
  @ApiParam({ name: 'identifier', example: '123456789' })
  @ApiOkResponse({ description: 'Contractor details.' })
  async getContractorByIdentifier(@Param('identifier') identifier: string) {
    const contractor =
      await this.contractorService.getContractorByIdentifier(identifier);

    if (!contractor) {
      throw new NotFoundException('Contractor not found');
    }

    return contractor;
  }
}
