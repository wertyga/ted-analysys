import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { AwardTendersTechService } from './award-tenders.tech.service';

@ApiTags('Admin Tech Award Tenders')
@ApiBearerAuth()
@Controller('/adm/tech/award-tenders')
@UseGuards(AdminAccessGuard)
export class AwardTendersTechController {
  constructor(
    private readonly awardTendersTechService: AwardTendersTechService,
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
}
