import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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
  collectAllCompetitionTenders(@Body() body: { pageLimit?: number }) {
    return this.tendersCronService.startGatherAllCompetitionTenders({
      forceUpdate: true,
      pageLimit: body?.pageLimit,
    });
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

  @ApiDefaultResponse({
    description: 'Downloaded tender short titles JSON.',
  })
  @Get('/short-titles/export')
  async exportTenderShortTitles(@Res() res: Response) {
    const data = await this.tendersTechService.getTenderShortTitlesByTenderId();
    const date = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tender-short-titles-${date}.json"`,
    );

    return res.send(JSON.stringify(data, null, 2));
  }
}
