import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@/guards';
import { TenderMatchingService } from './tender-matching.service';
import { TenderCompanyMatchModel } from '@/resources/tender-matching/schemas/tender-company-match.schema';
import { TariffService } from '@/resources/tariff';

@ApiTags('tender-matching')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('tender-matching')
export class TenderMatchingController {
  constructor(
    private readonly tenderMatchingService: TenderMatchingService,
    private readonly tariffService: TariffService,
  ) {}

  @Get('ai-fit')
  @ApiOperation({
    summary: 'Get completed AI-fit tender matches for current user',
  })
  @ApiOkResponse({
    description:
      'Tender matches with completed AI analysis and aiFitScore >= 65.',
  })
  async findAiFitMatches(
    @Req() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const tariff = await this.tariffService.getUserTariff(req.user);

    if (!tariff.rules.tenderMatching.enabled) {
      throw new ForbiddenException(
        'Tender matching is not available for this tariff',
      );
    }

    const { items, ...rest } =
      await this.tenderMatchingService.findCompletedAiFitMatchesForUser(
        req.user._id,
        65,
        {
          page: Number(page),
          limit: Number(limit),
        },
      );

    return {
      items: items.map((item) => TenderCompanyMatchModel.serializeList(item)),
      ...rest,
    };
  }
}
