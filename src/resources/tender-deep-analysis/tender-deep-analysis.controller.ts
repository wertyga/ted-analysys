import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
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
