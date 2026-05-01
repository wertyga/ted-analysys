import { model, Schema } from 'mongoose';

export enum LOG_TYPES {
  ERROR = 'ERROR',
  INFO = 'INFO',
}

const LogsSchema = new Schema(
  {
    type: {
      type: String,
      enum: LOG_TYPES,
    },
    message: String,
    data: Object,
  },
  { timestamps: true },
);

export const LogModel = model('Log', LogsSchema);

class Logger {
  private saveLog(
    customMessage: string,
    loglevel: LOG_TYPES,
    logData: any = {},
  ) {
    return LogModel.create({
      type: loglevel,
      message: customMessage,
      data: JSON.stringify(logData),
    });
  }

  async error(message: string, data?: any) {
    await this.saveLog(message, LOG_TYPES.ERROR, data);
  }

  async info(message: string, data?: any) {
    await this.saveLog(message, LOG_TYPES.INFO, data);
  }

  async emailSent(email: string, isRegister?: boolean) {
    await this.info('SENT_EMAIL', {
      email,
      type: isRegister ? 'registration' : 'restoration',
    });
  }
}

export const logger = new Logger();
