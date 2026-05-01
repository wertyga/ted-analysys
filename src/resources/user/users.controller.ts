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
import { UpdateUserDto, UserAuthDto } from './user.dto';
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

@ApiTags('Users')
@UseFilters(HttpErrorLoggingFilter)
@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @ApiBearerAuth()
  @ApiBody({ type: UpdateUserDto })
  @ApiDefaultResponse({ type: UserAuthDto })
  @UseGuards(AuthGuard)
  @Put('/update')
  async updateUser(@Req() req, @Body() userData: UpdateUserDto) {
    const user = await this.usersService.updateUser(userData, req.user);

    return { user: UserModel.serializeUser(filterModel(user), undefined) };
  }

  @ApiBearerAuth()
  @ApiDefaultResponse({ type: UserAuthDto })
  @Get('/self')
  async getSelfUser(@Req() req, @Headers() headers: Record<string, string>) {
    const user = await UserModel.findById(req.user._id.toString());

    return {
      user: UserModel.serializeUser(user as UserDocument),
    };
  }
}
