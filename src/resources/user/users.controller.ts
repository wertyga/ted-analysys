import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseFilters,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@/guards';
import {
  UpdateUserDto,
  UpdateUserNotificationsDto,
  UserAuthDto,
  UserMetaResponse,
} from './user.dto';
import { UsersService } from './users.service';
import { UserModel } from './user.schema';

import { HttpErrorLoggingFilter } from '@/http-logger/HTTPLogger';
import {
  ApiBearerAuth,
  ApiBody,
  ApiDefaultResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TenderWishlistService } from '@/resources/tender-wishlist/tender-wishlist.service';
import { TenderDeepAnalysisModel } from '@/resources/tender-deep-analysis/schemas';
import { TenderMatchingService } from '@/resources/tender-matching/tender-matching.service';
import { TenderCompanyMatchModel } from '@/resources/tender-matching/schemas/tender-company-match.schema';

@ApiTags('Users')
@UseFilters(HttpErrorLoggingFilter)
@Controller('/users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private tenderWishlistService: TenderWishlistService,
    private tenderMatchingService: TenderMatchingService,
  ) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user metadata counters' })
  @ApiDefaultResponse({ type: UserMetaResponse })
  @UseGuards(AuthGuard)
  @Get('/meta-data')
  async getUserMetaData(@Req() req) {
    const aiFitMatchesQuery = this.tenderMatchingService.getAiFitMatchesQuery(
      req.user._id,
      65,
    );

    const [wishlistCount, deepAnalysisCount, aiFitMatchesCount] =
      await Promise.all([
        this.tenderWishlistService.countUserTenders(req.user),
        TenderDeepAnalysisModel.countDocuments({ company: req.user._id }),
        TenderCompanyMatchModel.countDocuments(aiFitMatchesQuery),
      ]);

    return { wishlistCount, deepAnalysisCount, aiFitMatchesCount };
  }

  @ApiBearerAuth()
  @ApiBody({ type: UpdateUserDto })
  @ApiDefaultResponse({ type: UserAuthDto })
  @UseGuards(AuthGuard)
  @Put('/update')
  async updateUser(@Req() req, @Body() userData: UpdateUserDto) {
    const user = await this.usersService.updateUser(userData, req.user);

    return { user: UserModel.serializeUser(user) };
  }

  @ApiBearerAuth()
  @ApiBody({ type: UpdateUserNotificationsDto })
  @ApiDefaultResponse({ type: UserAuthDto })
  @UseGuards(AuthGuard)
  @Put('/notifications')
  async updateUserNotifications(
    @Req() req,
    @Body() userData: UpdateUserNotificationsDto,
  ) {
    const user = await this.usersService.updateUserNotifications(
      userData,
      req.user,
    );

    return { user: UserModel.serializeUser(user, true) };
  }

  @ApiBearerAuth()
  @ApiDefaultResponse({ type: UserAuthDto })
  @ApiQuery({
    name: 'withDescription',
    required: false,
    type: Boolean,
  })
  @Get('/self')
  async getSelfUser(
    @Req() req,
    @Query('withDescription') withDescription?: string,
  ) {
    if (!req.user) {
      return null;
    }

    const user = await this.usersService.getUser(req.user._id.toString());

    const exclude = !withDescription
      ? {}
      : { excludeFields: ['companyDescription'] };

    return {
      user: UserModel.serializeUser(user, false, exclude),
    };
  }
}
