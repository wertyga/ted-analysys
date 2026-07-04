import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { TendersTechService } from './tenders.tech.service';
import { GenerateTenderShortTitlesRequestDto } from './tenders.tech.dto';
import { TendersCronService } from '@/resources/cron/tenders-cron/tenders-cron.service';

@ApiTags('Admin Tech Tenders')
@ApiBearerAuth()
@Controller('/adm/tech/tenders')
@UseGuards(AdminAccessGuard)
export class TendersTechController {
  constructor(
    private readonly tendersTechService: TendersTechService,
    private readonly tendersCronService: TendersCronService,
  ) {}

  @ApiDefaultResponse({
    description: 'Current full TED competition tender gathering status.',
  })
  @Get('/gather-all-competition/status')
  getGatherAllCompetitionTendersStatus() {
    return this.tendersCronService.getAllCompetitionTendersStatus();
  }

  @Post('/gather-all-competition')
  collectAllCompetitionTenders() {
    return this.tendersCronService.gatherAllCompetitionTenders(true);
  }

  @ApiDefaultResponse({
    description: 'Generated missing AI short titles for tenders.',
  })
  @Post('/short-titles')
  generateMissingTenderShortTitles(
    @Body() body: GenerateTenderShortTitlesRequestDto,
  ) {
    return this.tendersTechService.generateMissingTenderShortTitles({
      limit: body.limit,
      batchSize: body.batchSize,
    });
  }
}
