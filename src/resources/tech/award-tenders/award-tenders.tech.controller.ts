import { Controller, Post, UseGuards } from '@nestjs/common';
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
  refreshAwardTendersHistory() {
    return this.awardTendersTechService.refreshAwardTendersHistory();
  }
}
