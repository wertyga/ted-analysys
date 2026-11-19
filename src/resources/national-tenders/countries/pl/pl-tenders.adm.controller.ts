import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseBoolPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { NationalTenderSource } from '@/resources/national-tenders/core/national-tender.types';
import { NationalTenderModel } from '@/resources/national-tenders/core/schemas/national-tender.schema';
import { NationalTendersStorageService } from '@/resources/national-tenders/core/national-tenders-storage.service';
import { PL_BZP_CONFIG } from './pl.config';
import { PlTendersService } from './pl-tenders.service';

@ApiTags('Admin National Tenders: Poland')
@ApiBearerAuth()
@Controller('/adm/national-tenders/pl')
@UseGuards(AdminAccessGuard)
export class PlTendersAdmController {
  constructor(
    private readonly plTendersService: PlTendersService,
    private readonly storage: NationalTendersStorageService,
  ) {}

  @Get('/status')
  @ApiOperation({ summary: 'BZP collector status' })
  getStatus() {
    return this.plTendersService.getStatus();
  }

  @Post('/gather-recent')
  @ApiOperation({
    summary: 'Collect BZP contract notices since the last stored publication',
  })
  gatherRecent() {
    return this.plTendersService.startRecent();
  }

  @Post('/backfill')
  @ApiOperation({ summary: 'Collect open BZP tenders for the last N days' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  backfill(@Query('days') days?: string) {
    const parsed = Number(days);

    return this.plTendersService.startBackfill(
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(parsed, 365)
        : PL_BZP_CONFIG.backfillDays,
    );
  }

  @Post('/backfill-results')
  @ApiOperation({
    summary: 'Collect BZP results (winners, contracts) for the last N days',
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  backfillResults(@Query('days') days?: string) {
    const parsed = Number(days);

    return this.plTendersService.startResultsBackfill(
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(parsed, 365)
        : PL_BZP_CONFIG.backfillDays,
    );
  }

  @Post('/match-open')
  @ApiOperation({
    summary:
      'Match all open Polish tenders with company filters and send instant reports',
  })
  matchOpen() {
    return this.plTendersService.startMatchOpen();
  }

  @Post('/migrate-buyers')
  @ApiOperation({
    summary:
      'One-off: move inline buyers of stored tenders to the shared buyers collection',
  })
  migrateBuyers() {
    return this.plTendersService.migrateInlineBuyers();
  }

  @Get('/tenders')
  @ApiOperation({ summary: 'Stored Polish tenders, newest first' })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Paginated national tenders.' })
  async getTenders(
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const skip = Math.max(Number(offset) || 0, 0);
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const filter = { source: NationalTenderSource.PL_BZP };

    const [tenders, total] = await Promise.all([
      NationalTenderModel.find(filter)
        .sort({ publicationDate: -1 })
        .skip(skip)
        .limit(take)
        .lean(),
      NationalTenderModel.countDocuments(filter),
    ]);

    return { tenders, total };
  }

  @Get('/tenders/:id')
  @ApiQuery({ name: 'raw', required: false, type: Boolean })
  async getTender(
    @Param('id') id: string,
    @Query('raw', new ParseBoolPipe({ optional: true })) raw?: boolean,
  ) {
    const tender = await this.storage.findById(id, raw).lean();

    if (!tender) {
      throw new NotFoundException('Tender not found');
    }

    return tender;
  }

  @Get('/tenders/:id/renormalize')
  @ApiOperation({
    summary: 'Normalize the stored raw notice again (dry run, nothing saved)',
  })
  async renormalize(@Param('id') id: string) {
    const tender = await this.plTendersService.renormalize(id);

    if (!tender) {
      throw new NotFoundException('Tender or raw notice not found');
    }

    return { ...tender, rawData: undefined };
  }
}
