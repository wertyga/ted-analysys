import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiDefaultResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@/guards';
import { TenderWishlistService } from './tender-wishlist.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderDocument } from '@/resources/tenders/schemas';
import { TenderWishlistStatusDto } from './dto/tender-wishlist-status.dto';

@ApiTags('Tender Wishlist')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('/wishlist')
export class TenderWishlistController {
  constructor(
    private readonly wishlistService: TenderWishlistService,
    private readonly tendersService: TendersService,
  ) {}

  @Get('/')
  @ApiOperation({ summary: 'Get current user tender wishlist' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiDefaultResponse({ description: 'Current user wishlist.' })
  async listWishlist(
    @Req() req,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    const wishlist = await this.wishlistService.listUserTenders(
      req.user,
      page,
      limit,
    );

    return {
      ...wishlist,
      tenders: wishlist.tenders.map((tender) =>
        this.tendersService.toWholeTenderListDto(
          tender as unknown as TenderDocument,
        ),
      ),
    };
  }

  @Get('/:tenderId')
  @ApiOperation({ summary: 'Check whether tender is in current user wishlist' })
  @ApiOkResponse({ type: TenderWishlistStatusDto })
  getWishlistStatus(@Req() req, @Param('tenderId') tenderId: string) {
    return this.wishlistService.getTenderStatus(req.user, tenderId);
  }

  @Post('/:tenderId')
  @ApiOperation({ summary: 'Add tender to current user wishlist' })
  @ApiOkResponse({ type: TenderWishlistStatusDto })
  addTender(@Req() req, @Param('tenderId') tenderId: string) {
    return this.wishlistService.addTender(req.user, tenderId);
  }

  @Delete('/:tenderId')
  @ApiOperation({ summary: 'Remove tender from current user wishlist' })
  @ApiOkResponse({ type: TenderWishlistStatusDto })
  removeTender(@Req() req, @Param('tenderId') tenderId: string) {
    return this.wishlistService.removeTender(req.user, tenderId);
  }
}
