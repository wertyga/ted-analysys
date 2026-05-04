import { Injectable } from '@nestjs/common';
import {
  TUser as UserType,
  USER_TYPE,
  UserDocument,
} from '@/resources/user/user.types';
import { UserModel } from '@/resources/user/user.schema';
import { generateHash, generateToken } from '@/utils';
import { CreateUserDto, OauthSignInDto, SignInUserDto } from './auth.dto';
import { gfEmail, gfErrors } from '@/goldfish';
import { EmailService } from '@/resources/email/email.service';
import { EMAIL_TEMPLATES } from '@/resources/email/type';
import { getEmailTemplate } from '@/resources/email/email.utils';
import { AuthServiceUtils } from './auth.service.utils';

@Injectable()
export class AuthService {
  utils: AuthServiceUtils;

  constructor(private emailService: EmailService) {
    this.utils = new AuthServiceUtils();
  }

  constructCreateTempUserPayload({
    email,
    password,
  }: Pick<UserType, 'email' | 'password'>) {
    const token = generateToken(email);

    const payload: Partial<UserType> = {
      tempEmail: email,
      email: `${Math.random()}__TEMPORARY_EMAIL`,
      recoveryToken: token,
      hashPassword: generateHash(password),
      status: USER_TYPE.TEMPORARY,
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
      .replace('{{confirmLink}}', recoveryLink)
      .replace('{{recoveryToken}}', replaceData.recoveryToken)
      .replace('{{companyName}}', replaceData.companyName);

    const subject = isRegister
      ? gfEmail.registerSubject
      : gfEmail.recoverySubject;

    await this.emailService.sendEmail({
      to: email,
      subject,
      html,
    });
  }

  async createNewUser(userPayload: CreateUserDto): Promise<UserDocument> {
    const payload = this.constructCreateTempUserPayload(userPayload);

    return UserModel.create(payload as any);
  }

  async confirmUserEmail(recoveryToken: string) {
    const user = await UserModel.findOne({ recoveryToken });

    if (!user) {
      return null;
    }

    user.status = USER_TYPE.USER;
    user.email = user.tempEmail as string;
    user.tempEmail = '';
    user.recoveryToken = '';
    user.token = generateToken(user.email);
    await user.save();

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

    return user;
  }
}
