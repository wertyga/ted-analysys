import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiDefaultResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAccessGuard } from '@/guards';
import { PaginationAndSortDto } from '@/Dto';
import { SORT_DIRECTION } from '@/types';
import { tenderCpvPopulateFields } from '@/resources/tenders/utils/tender.utils';
import { TenderModel } from '@/resources/tenders/schemas';

class GetTendersRequestDto extends PaginationAndSortDto {}

@ApiTags('Admin Tenders')
@ApiBearerAuth()
@Controller('/tenders/adm')
@UseGuards(AdminAccessGuard)
export class TendersAdmController {
  @ApiQuery({ type: GetTendersRequestDto })
  @ApiDefaultResponse({ description: 'Paginated tender list.' })
  @Get('/')
  async getTenders(@Query() query: GetTendersRequestDto) {
    const offset = Math.max(query.offset ?? 0, 0);
    const limit = Math.min(Math.max(query.limit ?? 12, 1), 100);
    const sortDirection = query.sortDirection === SORT_DIRECTION.ASC ? 1 : -1;

    const [tenders, total] = await Promise.all([
      TenderModel.find({})
        .sort({ createdAt: sortDirection })
        .skip(offset)
        .limit(limit)
        .populate(tenderCpvPopulateFields)
        .exec(),
      TenderModel.countDocuments({}).exec(),
    ]);

    return {
      tenders: tenders.map((tender) => TenderModel.serializeList(tender)),
      total,
    };
  }
}
