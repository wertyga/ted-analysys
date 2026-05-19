import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseFilters,
  UseGuards,
  Headers,
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
import { filterModel } from '@/utils';

import { HttpErrorLoggingFilter } from '@/http-logger/HTTPLogger';
import { UserDocument } from '@/resources/user/user.types';
import {
  ApiBearerAuth,
  ApiBody,
  ApiDefaultResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenderWishlistService } from '@/resources/tender-wishlist/tender-wishlist.service';
import { TenderDeepAnalysisModel } from '@/resources/tender-deep-analysis/schemas';

@ApiTags('Users')
@UseFilters(HttpErrorLoggingFilter)
@Controller('/users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private tenderWishlistService: TenderWishlistService,
  ) {}

  @ApiBearerAuth()
  @ApiDefaultResponse({ type: UserMetaResponse })
  @UseGuards(AuthGuard)
  @Get('/meta-data')
  async getUserMetaData(@Req() req) {
    const [wishlistCount, deepAnalysisCount] = await Promise.all([
      this.tenderWishlistService.countUserTenders(req.user),
      TenderDeepAnalysisModel.countDocuments({ company: req.user._id }),
    ]);

    return { wishlistCount, deepAnalysisCount };
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
  @Get('/self')
  async getSelfUser(@Req() req, @Headers() headers: Record<string, string>) {
    if (!req.user) {
      return null;
    }

    const user = await this.usersService.getUser(req.user._id.toString());

    return {
      user: UserModel.serializeUser(user as UserDocument),
    };
  }
}
