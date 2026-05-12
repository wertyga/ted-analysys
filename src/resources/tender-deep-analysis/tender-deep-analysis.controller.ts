import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@/guards';
import { TenderDeepAnalysisService } from './tender-deep-analysis.service';

@ApiTags('deep-analysis')
@UseGuards(AuthGuard)
@Controller('tenders/:tenderId/deep-analysis')
export class TenderDeepAnalysisController {
  constructor(
    private readonly tenderDeepAnalysisService: TenderDeepAnalysisService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Run deep company-fit tender analysis' })
  @ApiOkResponse({ description: 'Saved deep company-fit analysis' })
  async analyze(@Param('tenderId') tenderId: string, @Req() req) {
    return this.tenderDeepAnalysisService.analyzeTenderDeepCompanyFit({
      tenderId,
      companyId: String(req.user._id),
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get latest completed deep company-fit analysis' })
  @ApiOkResponse({ description: 'Latest completed deep company-fit analysis' })
  @ApiNotFoundResponse({ description: 'Deep analysis not found' })
  async getLatest(@Param('tenderId') tenderId: string, @Req() req) {
    const companyId = String(req.user._id);
    const analysis =
      await this.tenderDeepAnalysisService.getLatestCompletedByTenderAndCompany(
        {
          tenderId,
          companyId,
        },
      );

    if (!analysis) {
      throw new NotFoundException(
        `Deep analysis for tender ${tenderId} and company ${companyId} not found`,
      );
    }

    return this.tenderDeepAnalysisService.toDetailDto(analysis);
  }
}

@ApiTags('deep-analysis')
@UseGuards(AuthGuard)
@Controller('deep-analysis')
export class UserTenderDeepAnalysisController {
  constructor(
    private readonly tenderDeepAnalysisService: TenderDeepAnalysisService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get current user deep analyses sorted by creation date',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ description: 'Current user deep analyses' })
  async listUserDeepAnalyses(
    @Req() req,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    const result = await this.tenderDeepAnalysisService.listByCompany({
      companyId: String(req.user._id),
      page,
      limit,
    });

    return result;
  }
}
