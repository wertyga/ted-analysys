import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
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
  async searchContractors(@Query() query: ContractorListRequestDto) {
    const { totalCount, contractors } =
      await this.contractorService.searchContractors(query);

    return {
      totalCount,
      contractors: contractors.map(ContractorModel.serializeList),
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get contractor collection stats' })
  @ApiOkResponse({ description: 'Contractor stats.' })
  getContractorStats() {
    return this.contractorService.getContractorStats();
  }

  @Get('meta')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(10 * 60 * 1000)
  @ApiOperation({ summary: 'Get contractor filter metadata' })
  @ApiOkResponse({ description: 'Contractor metadata.' })
  getContractorMeta() {
    return this.contractorService.getContractorMeta();
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
      awardTendersWithWonLots: awardTenders.map((at) => {
        const listTender = AwardTenderModel.serializeList(at);
        return {
          ...listTender,
          lots: listTender.lots
            .map((_, i) => {
              return at.lots[i];
            })
            .filter((l) => {
              return l.winner?.toString() === id;
            }),
        };
      }),
    };
  }
}
