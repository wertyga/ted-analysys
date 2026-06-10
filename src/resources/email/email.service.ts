import nodemailer, { type Transporter } from 'nodemailer';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { gfTime } from '@/goldfish';
import { EMAIL_TEMPLATES } from './type';
import { EmailReplaceData, replaceTemplateVars } from './email.utils';

type Options = {
  to: string;
  subject?: string;
  text?: string;
  html?: string;
};

@Injectable()
export class EmailService {
  private transporter: Transporter;
  private emailSentTimers: Record<
    string,
    { timer: NodeJS.Timeout; timeEnd: number }
  >;
  private from: string = `${process.env.APP_NAME ?? ''} <no-reply@tenderwize.com>`;

  constructor() {
    this.emailSentTimers = {};
    this.transporter = nodemailer.createTransport(this.getMailerConfig());
  }

  private getMailerConfig() {
    const host = process.env.MAIL_SMPT_SERVER;
    const port = Number(process.env.MAIL_SMPT_PORT);
    const user = process.env.MAIL_USERNAME;
    const pass = process.env.MAIL_PASSWORD;

    if (!host || !user || !pass) {
      console.error(
        'SMTP is not configured. Set MAIL_SMPT_SERVER, MAIL_SMPT_PORT, MAIL_USERNAME, and MAIL_PASSWORD.',
      );
    }

    return {
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    };
  }

  private _handleTimer(to: string, timeout = gfTime.minute * 2) {
    if (this.emailSentTimers[to]) {
      const remainTime =
        this.emailSentTimers[to].timeEnd - new Date().getTime();
      throw new HttpException(
        `Too many requests - try in ${Math.round(remainTime / 1000)} seconds`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.emailSentTimers[to] = {
      timeEnd: new Date().getTime() + timeout,
      timer: setTimeout(() => {
        clearTimeout(this.emailSentTimers[to].timer);
        delete this.emailSentTimers[to];
      }, timeout),
    };
  }

  sendEmailToUser<T extends EMAIL_TEMPLATES>(
    template: T,
    email: string,
    subject: string,
    variables?: EmailReplaceData<T>,
  ) {
    const emailHtml = replaceTemplateVars(template, variables);
    const emailPayload = {
      to: email,
      subject,
      html: emailHtml,
    };

    return this.sendEmail(emailPayload);
  }

  sendEmail(options: Options) {
    return new Promise((res, rej) => {
      this.transporter.sendMail(
        { ...options, from: this.from },
        (err, data) => {
          if (err) {
            rej(err);
          } else {
            res(data);
          }
        },
      );
    });
  }
}
