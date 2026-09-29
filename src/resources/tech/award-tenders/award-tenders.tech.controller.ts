import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { AwardTendersTechService } from './award-tenders.tech.service';
import { AwardValuesFixTechService } from './award-values-fix.tech.service';
import { AwardValueReviewTechService } from './award-value-review.tech.service';
import type { AwardValueReviewStatus } from '@/resources/award-tender/schemas';

@ApiTags('Admin Tech Award Tenders')
@ApiBearerAuth()
@Controller('/adm/tech/award-tenders')
@UseGuards(AdminAccessGuard)
export class AwardTendersTechController {
  constructor(
    private readonly awardTendersTechService: AwardTendersTechService,
    private readonly awardValuesFixTechService: AwardValuesFixTechService,
    private readonly awardValueReviewTechService: AwardValueReviewTechService,
  ) {}

  @ApiDefaultResponse({
    description: 'Refreshed award tenders from TED result notices.',
  })
  @Post('/refresh')
  refreshAwardTendersHistory(@Body() body: any) {
    const {
      pageLimit,
      paginationMode,
      skipExistingByPublicationNumber,
      ...filters
    } = body ?? {};

    return this.awardTendersTechService.startRefreshAwardTendersHistory(
      filters,
      { pageLimit, paginationMode, skipExistingByPublicationNumber },
    );
  }

  @Get('/refresh/status')
  getRefreshAwardTendersHistoryStatus() {
    return this.awardTendersTechService.getRefreshAwardTendersHistoryStatus();
  }

  @ApiDefaultResponse({
    description:
      'Recomputed awardDate (latest plausible award decision date) for all award tenders.',
  })
  @Post('/backfill-award-dates')
  backfillAwardDates() {
    return this.awardTendersTechService.backfillAwardDates();
  }

  @ApiDefaultResponse({
    description: 'Filled missing award countries from lead buyer countries.',
  })
  @Post('/backfill-award-countries')
  backfillAwardCountries() {
    return this.awardTendersTechService.backfillAwardCountries();
  }

  @ApiDefaultResponse({
    description:
      'Started re-applying award value sanity rules to saved award tenders. Dry run unless dryRun is false.',
  })
  @Post('/fix-award-values')
  fixAwardValues(
    @Body()
    body: {
      dryRun?: boolean;
      refetchXml?: boolean;
      refetchMinAwardValueEur?: number;
    },
  ) {
    return this.awardValuesFixTechService.start({
      dryRun: body?.dryRun !== false,
      refetchXml: body?.refetchXml === true,
      refetchMinAwardValueEur: body?.refetchMinAwardValueEur,
    });
  }

  @Get('/fix-award-values/status')
  getFixAwardValuesStatus() {
    return this.awardValuesFixTechService.getStatus();
  }

  @ApiDefaultResponse({
    description:
      'Started LLM review of award values over the threshold. Suggestions wait for Apply.',
  })
  @Post('/value-review')
  startValueReview(
    @Body()
    body: {
      minAwardValueEur?: number;
      limit?: number;
      recheck?: boolean;
    },
  ) {
    return this.awardValueReviewTechService.start({
      minAwardValueEur: body?.minAwardValueEur,
      limit: body?.limit,
      recheck: body?.recheck === true,
    });
  }

  @Get('/value-review/status')
  getValueReviewStatus() {
    return this.awardValueReviewTechService.getStatus();
  }

  @Post('/value-review/stop')
  stopValueReview() {
    return this.awardValueReviewTechService.stop();
  }

  @Get('/value-review/items')
  getValueReviewItems(@Query('status') status?: AwardValueReviewStatus) {
    return this.awardValueReviewTechService.list(status);
  }

  @ApiDefaultResponse({
    description:
      'Writes the suggested values to award tenders and refreshes buyer/contractor stats.',
  })
  @Post('/value-review/apply')
  applyValueReview(@Body() body: { ids: string[] }) {
    return this.awardValueReviewTechService.apply(body?.ids ?? []);
  }

  @Post('/value-review/reject')
  rejectValueReview(@Body() body: { ids: string[] }) {
    return this.awardValueReviewTechService.reject(body?.ids ?? []);
  }
}
