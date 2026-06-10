import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { TendersTechService } from './tenders.tech.service';
import { GenerateTenderShortTitlesRequestDto } from './tenders.tech.dto';

@ApiTags('Admin Tech Tenders')
@ApiBearerAuth()
@Controller('/adm/tech/tenders')
@UseGuards(AdminAccessGuard)
export class TendersTechController {
  constructor(private readonly tendersTechService: TendersTechService) {}

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
