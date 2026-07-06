import { Injectable } from '@nestjs/common';
import {
  TUser as UserType,
  USER_TYPE,
  UserDocument,
} from '@/resources/user/user.types';
import { UserModel } from '@/resources/user/user.schema';
import { generateHash, generateToken, logger } from '@/utils';
import { CreateUserDto, OauthSignInDto, SignInUserDto } from './auth.dto';
import { gfEmail, gfErrors } from '@/goldfish';
import { EmailService } from '@/resources/email/email.service';
import { EMAIL_TEMPLATES } from '@/resources/email/type';
import {
  getEmailBrandName,
  getEmailTemplate,
} from '@/resources/email/email.utils';
import { AuthServiceUtils } from './auth.service.utils';
import { CouponService } from '@/resources/coupon';

@Injectable()
export class AuthService {
  utils: AuthServiceUtils;

  constructor(
    private emailService: EmailService,
    private readonly couponService: CouponService,
  ) {
    this.utils = new AuthServiceUtils();
  }

  constructCreateTempUserPayload({
    email,
    password,
    tempFreeUseCouponCode,
  }: Pick<UserType, 'email' | 'password' | 'tempFreeUseCouponCode'>) {
    const token = generateToken(email);

    const payload: Partial<UserType> = {
      tempEmail: email,
      email: `${Math.random()}__TEMPORARY_EMAIL`,
      recoveryToken: token,
      hashPassword: generateHash(password),
      status: USER_TYPE.TEMPORARY,
      tempFreeUseCouponCode,
    };

    return payload;
  }

  static isPasswordsValid(password: string, hashPassword?: string) {
    if (!password || !hashPassword) return false;

    return generateHash(password) === hashPassword;
  }

  async sendConfirmLink({
    email,
    replaceData = {},
    token,
    redirectUrl,
    emailTemplate,
    origin,
  }: {
    email: string;
    replaceData?: Record<string, string>;
    token?: string;
    origin: string;
    redirectUrl?: string;
    emailTemplate: EMAIL_TEMPLATES;
  }) {
    const recoveryLink =
      redirectUrl && token ? `${origin}${redirectUrl}?token=${token}` : '';
    const isRegister = emailTemplate === EMAIL_TEMPLATES.ConfirmEmail;

    const html = getEmailTemplate(emailTemplate)
      .replace(/{{brandName}}/g, getEmailBrandName())
      .replace('{{confirmLink}}', recoveryLink)
      .replace('{{recoveryToken}}', replaceData.recoveryToken)
      .replace('{{companyName}}', replaceData.companyName);

    const subject = isRegister
      ? gfEmail.registerSubject
      : gfEmail.recoverySubject;

    try {
      await this.emailService.sendEmail({
        to: email,
        subject,
        html,
      });
    } catch (e) {
      logger.error('sendConfirmLink', e);
    }
  }

  async upsertTempUser(
    userPayload: CreateUserDto,
    couponCode?: string,
  ): Promise<UserDocument> {
    const payload = this.constructCreateTempUserPayload({
      ...userPayload,
      tempFreeUseCouponCode: couponCode,
    });

    return UserModel.findOneAndUpdate(
      { tempEmail: payload.tempEmail },
      { $set: payload },
      { upsert: true, returnDocument: 'after' },
    );
  }

  async confirmUserEmail(recoveryToken: string) {
    const user = await UserModel.findOne({ recoveryToken });

    if (!user) {
      return null;
    }

    const freeUseCouponCode = user.tempFreeUseCouponCode;

    user.status = USER_TYPE.USER;
    user.email = user.tempEmail as string;
    user.tempEmail = '';
    user.tempFreeUseCouponCode = '';
    user.recoveryToken = '';
    user.token = generateToken(user.email);
    await user.save();

    if (freeUseCouponCode) {
      await this.couponService.redeemFreeUseCouponForUser(
        user,
        freeUseCouponCode,
      );
    }

    return user;
  }

  changePassword(password: string, user: UserDocument) {
    user.recoveryToken = '';
    user.token = generateToken();
    user.hashPassword = generateHash(password);

    return user.save();
  }

  async authSignIn({ email, password }: SignInUserDto) {
    const user = await UserModel.findOne({
      email,
      status: { $ne: USER_TYPE.TEMPORARY },
    });

    const isPasswordsCompared = AuthService.isPasswordsValid(
      password,
      user?.hashPassword,
    );

    if (!user || !isPasswordsCompared) {
      throw gfErrors.userNotFound();
    }

    user.token = generateToken(email);
    user.recoveryToken = '';
    user.tempEmail = '';

    return user.save();
  }

  async oauthSignIn({ email }: OauthSignInDto) {
    const token = generateToken(email);

    const existsUser = await UserModel.findOne({ email });

    const user = await UserModel.findOneAndUpdate(
      { email },
      {
        $set: {
          token,
          recoveryToken: '',
          tempEmail: '',
        },
        $setOnInsert: {
          email,
          status: USER_TYPE.USER,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return {
      user,
      isNewUser: !existsUser,
    };
  }
}
