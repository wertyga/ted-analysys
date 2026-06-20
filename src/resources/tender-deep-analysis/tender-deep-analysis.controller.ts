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
import { AuthGuard, TariffProGuard } from '@/guards';
import { TenderDeepAnalysisService } from './tender-deep-analysis.service';
import { TenderDeepAnalysisModel } from './schemas';

@ApiTags('deep-analysis')
@UseGuards(TariffProGuard)
@Controller('tenders/:tenderId/deep-analysis')
export class TenderDeepAnalysisController {
  constructor(
    private readonly tenderDeepAnalysisService: TenderDeepAnalysisService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Run deep company-fit tender analysis' })
  @ApiQuery({ name: 'language', required: false, example: 'en' })
  @ApiQuery({ name: 'forceUpdate', required: false, example: 'true' })
  @ApiOkResponse({
    description: 'Saved deep company-fit analyses grouped by language',
  })
  async analyze(
    @Param('tenderId') tenderId: string,
    @Req() req,
    @Query('language') language = 'en',
    @Query('forceUpdate') forceUpdate: string,
  ) {
    const analysis =
      await this.tenderDeepAnalysisService.analyzeTenderDeepCompanyFit({
        tenderId,
        companyId: String(req.user._id),
        language,
        forceUpdate: !!forceUpdate,
      });

    return TenderDeepAnalysisModel.serializeDetail(analysis as any);
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
  @ApiQuery({ name: 'tenderIds', required: false, example: ['272075-2026'] })
  @ApiOkResponse({ description: 'Current user deep analyses' })
  async listUserDeepAnalyses(
    @Req() req,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('tenderIds') tenderIds: string[] = [],
  ) {
    const result = await this.tenderDeepAnalysisService.listByCompany({
      companyId: String(req.user._id),
      page,
      limit,
      tenderIds,
    });

    return {
      ...result,
      analyses: result.analyses.map((analysis) => {
        return TenderDeepAnalysisModel.serializeDetail(analysis as any);
      }),
    };
  }
}
