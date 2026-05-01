import { Body, Controller, Post } from '@nestjs/common';
import { filterModel, logger } from '@/utils';
import { UserAuthDto } from '@/resources/user/user.dto';
import { UserModel } from '@/resources/user/user.schema';
import { USER_TYPE } from '@/resources/user/user.types';
import { gfErrors } from '@/goldfish';
import { ApiBody, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import { SignInUserDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('Admin Auth')
@Controller('/auth/adm')
export class AuthAdmController {
  constructor(private authService: AuthService) {}

  @ApiBody({ type: SignInUserDto })
  @ApiDefaultResponse({ type: UserAuthDto })
  @Post('/signin')
  async signInAdmin(@Body() data: SignInUserDto) {
    const user = await this.authService.authSignIn(data);
    const isAdmin = [USER_TYPE.ADMIN, USER_TYPE.SUPER_ADMIN].includes(
      user?.status,
    );

    if (!isAdmin) {
      throw gfErrors.userNotFound();
    }

    logger.info('SIGN_IN', { email: user.email });
    return {
      user: UserModel.serializeUser(filterModel(user)),
    };
  }
}
