import { Controller, Req, Get, UseGuards, Query } from '@nestjs/common';
import { GetUsersRequestDto } from './user.dto';
import { UserModel } from './user.schema';

import { AdminAccessGuard } from '@/guards';
import { UsersService } from './users.service';
import {
  ApiBearerAuth,
  ApiDefaultResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Admin Users')
@ApiBearerAuth()
@Controller('/users/adm')
@UseGuards(AdminAccessGuard)
export class UsersAdmController {
  constructor(private userService: UsersService) {}

  @ApiQuery({ type: GetUsersRequestDto })
  @ApiDefaultResponse({ description: 'Paginated user list.' })
  @Get('/')
  async getUsers(@Query() query: GetUsersRequestDto) {
    const { users, total } = await this.userService.getUsersList(query);

    return {
      users: users.map((user) =>
        UserModel.serializeUser(user, true, undefined, true),
      ),
      total,
    };
  }

  @ApiDefaultResponse({ description: 'Current admin user.' })
  @Get('/self')
  async getSelfUser(@Req() req) {
    return UserModel.serializeUser(req.user);
  }
}
