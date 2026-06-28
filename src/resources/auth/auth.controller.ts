import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { join } from 'path';
import { filterModel, generateToken, getOrigin, logger } from '@/utils';
import { UserAuthDto } from '@/resources/user/user.dto';
import { UserModel } from '@/resources/user/user.schema';
import { USER_TYPE, UserDocument } from '@/resources/user/user.types';
import { gfErrors } from '@/goldfish';
import {
  ApiBody,
  ApiBearerAuth,
  ApiDefaultResponse,
  ApiHeaders,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { headers, SuccessDto } from '@/Dto';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  ChangePasswordInitDto,
  ConfirmEmailDto,
  CreateUserDto,
  OauthSignInDto,
  SignInUserDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { replaceTemplateVars } from '@/resources/email/email.utils';
import { EMAIL_TEMPLATES } from '@/resources/email/type';
import { HttpErrorLoggingFilter } from '@/http-logger/HTTPLogger';
import { AuthGuard } from '@/guards';
import { CouponService, FREE_USE_COUPON_HEADER } from '@/resources/coupon';

export const AUTH_EXCLUDE_FIELDS = [] as (keyof UserDocument)[];

@ApiTags('Auth')
@UseFilters(HttpErrorLoggingFilter)
@Controller('/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly couponService: CouponService,
  ) {}

  @Get('/google-test')
  googleAuthTest(@Res() res) {
    return res.sendFile(join(process.cwd(), 'test-html', 'google-auth.html'));
  }

  @ApiBody({ type: SignInUserDto })
  @ApiDefaultResponse({ type: UserAuthDto })
  @Post('/oauth/google')
  async oauthGoogle(
    @Body() data: OauthSignInDto,
    @Headers(FREE_USE_COUPON_HEADER) couponCode?: string,
  ) {
    const user = await this.authService.oauthSignIn(data);

    if (couponCode) {
      await this.couponService.redeemFreeUseCouponForUser(user, couponCode);
    }

    return {
      user: UserModel.serializeUser(user, undefined, {
        excludeFields: AUTH_EXCLUDE_FIELDS,
      }),
    };
  }

  @ApiBody({ type: SignInUserDto })
  @ApiDefaultResponse({ type: UserAuthDto })
  @Post('/signin')
  async signInUser(@Body() data: SignInUserDto) {
    const user = await this.authService.authSignIn(data);

    logger.info('SIGN_IN', { email: user.email });

    return {
      user: UserModel.serializeUser(
        filterModel(user, { excludeFields: AUTH_EXCLUDE_FIELDS }),
      ),
    };
  }

  @ApiBody({ type: CreateUserDto })
  @ApiDefaultResponse({ type: SuccessDto })
  @Post('/signup')
  async signUpUser(
    @Body() userPayload: CreateUserDto,
    @Headers(FREE_USE_COUPON_HEADER) couponCode: string | undefined,
  ) {
    const { email } = userPayload;

    await this.authService.utils.checkIfUserExistsGuard([
      { tempEmail: email },
      { email },
    ]);

    const user = await this.authService.upsertTempUser(userPayload, couponCode);

    await this.authService.sendConfirmLink({
      email: user.tempEmail ?? '',
      origin: process.env.SERVER_ORIGIN ?? '',
      replaceData: {
        companyName: user.tempEmail ?? '',
      },
      token: user.recoveryToken,
      redirectUrl: '/auth/confirm-email',
      emailTemplate: EMAIL_TEMPLATES.ConfirmEmail,
    });

    logger.info('SIGN_UP', { email });

    return { success: true };
  }

  @ApiQuery({ type: ConfirmEmailDto })
  @ApiDefaultResponse({ type: UserAuthDto })
  @Get('/confirm-email')
  async confirmEmail(@Query() { token }: ConfirmEmailDto, @Res() res) {
    const user = await this.authService.confirmUserEmail(token);

    let html = '';

    if (!user) {
      throw gfErrors.dataBroken();
    } else {
      logger.info('CONFIRM_EMAIL', { email: user.email });

      html = replaceTemplateVars(EMAIL_TEMPLATES.ConfirmedEmail, {
        companyName: user.email ?? '',
        origin: process.env.USER_DASHBOARD_URL ?? '',
      });
    }

    res.send(html);
  }

  @ApiDefaultResponse({ type: SuccessDto })
  @ApiBody({ type: ChangePasswordInitDto })
  @Post('/change-password-init')
  async changePasswordInit(
    @Req() req,
    @Body() { email }: ChangePasswordInitDto,
  ) {
    const recoveryToken = (Math.random() * 1000000).toFixed(0);
    const user = await UserModel.findOneAndUpdate(
      { email, user: { $ne: USER_TYPE.TEMPORARY } },
      { $set: { recoveryToken } },
      { returnDocument: 'after' },
    );

    if (!user) {
      return { success: true };
    }

    await this.authService.sendConfirmLink({
      email,
      origin: getOrigin(req),
      replaceData: {
        recoveryToken,
      },
      emailTemplate: EMAIL_TEMPLATES.RestorePassword,
    });

    logger.info('CHANGE_PASSWORD_INIT', { newEmail: email, userId: user._id });

    return {
      success: true,
    };
  }

  @ApiDefaultResponse({ type: UserAuthDto })
  @ApiBody({ type: ChangePasswordDto })
  @Post('/change-password')
  async changePassword(@Body() { password, token, email }: ChangePasswordDto) {
    const user = await UserModel.findOne({
      email,
      recoveryToken: token,
      status: { $ne: USER_TYPE.TEMPORARY },
    });

    if (!user) {
      throw gfErrors.userNotFound();
    }

    const updatedUser = await this.authService.changePassword(password, user);

    logger.info('CHANGED_PASSWORD', { email: updatedUser.email });

    return {
      success: true,
    };
  }

  @ApiBearerAuth()
  @ApiHeaders([headers.authorization])
  @ApiDefaultResponse({ type: SuccessDto })
  @ApiBody({ type: ChangeEmailDto })
  @UseGuards(AuthGuard)
  @Post('/change-email')
  async changeEmail(
    @Req() req,
    @Body() { newEmail, password }: ChangeEmailDto,
  ) {
    const isUserValid = AuthService.isPasswordsValid(
      password,
      req.user?.hashPassword,
    );
    if (!isUserValid) {
      throw gfErrors.userNotFound();
    }

    await this.authService.utils.checkIfUserExistsGuard([{ email: newEmail }]);

    req.user.tempEmail = newEmail;
    req.user.recoveryToken = generateToken(newEmail);

    await Promise.all([
      await this.authService.sendConfirmLink({
        email: req.user.tempEmail,
        origin: getOrigin(req),
        replaceData: {
          companyName: req.user.companyName,
        },
        token: req.user.recoveryToken,
        redirectUrl: '/auth/confirm-email',
        emailTemplate: EMAIL_TEMPLATES.ConfirmEmail,
      }),
      req.user.save(),
    ]);

    logger.info('CHANGE_EMAIL_SEND_CONFIRM', {
      email: req.user.email,
      newEmail,
    });

    return { success: true };
  }
}
