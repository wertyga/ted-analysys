import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ContractorService } from './contractor.service';
import { ContractorListRequestDto } from './dto/contractor-list-request.dto';
import { ContractorSearchRequestDto } from './dto/contractor-search-request.dto';
import { ContractorAwardTendersRequestDto } from './dto/contractor-award-tenders-request.dto';
import {
  ContractorDetailDto,
  ContractorModel,
} from '@/resources/contractor/schemas';
import {
  AwardTenderListDto,
  AwardTenderModel,
} from '@/resources/award-tender/schemas';

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

  @Get(':id/award-tenders')
  @ApiOperation({ summary: 'Get contractor award tenders' })
  @ApiQuery({ type: ContractorAwardTendersRequestDto })
  @ApiOkResponse({ description: 'Contractor award tenders.' })
  getContractorAwardTenders(
    @Param('id') id: string,
    @Query() query: ContractorAwardTendersRequestDto,
  ) {
    return this.contractorService.getContractorAwardTenders(id, {
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contractor details' })
  @ApiOkResponse({ description: 'Contractor details.' })
  async getContractorById(@Param('id') id: string): Promise<{
    contractor: ContractorDetailDto;
    awardTendersWithWonLots: Omit<AwardTenderListDto, 'winners'>[];
  }> {
    const { contractor, awardTenders } =
      await this.contractorService.getContractorById(id);

    return {
      contractor: ContractorModel.serializeDetail(contractor),
      awardTendersWithWonLots: awardTenders
        .map(AwardTenderModel.serializeList)
        .map(({ winners, ...at }) => {
          return {
            ...at,
            lots: at.lots.filter((l) => {
              return l.winner?.toString() === id;
            }),
          };
        }),
    };
  }
}
