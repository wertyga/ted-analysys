import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { AwardTendersTechService } from './award-tenders.tech.service';
import { AwardValuesFixTechService } from './award-values-fix.tech.service';

@ApiTags('Admin Tech Award Tenders')
@ApiBearerAuth()
@Controller('/adm/tech/award-tenders')
@UseGuards(AdminAccessGuard)
export class AwardTendersTechController {
  constructor(
    private readonly awardTendersTechService: AwardTendersTechService,
    private readonly awardValuesFixTechService: AwardValuesFixTechService,
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
}
