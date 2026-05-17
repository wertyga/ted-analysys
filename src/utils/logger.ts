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
    ip: String,
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
    ip?: string | null,
  ) {
    return LogModel.create({
      type: loglevel,
      ip: ip ?? '',
      message: customMessage,
      data: JSON.stringify(logData),
    });
  }

  async error(message: string, data?: any, ip?: string | null) {
    await this.saveLog(message, LOG_TYPES.ERROR, data, ip);
  }

  async info(message: string, data?: any, ip?: string | null) {
    await this.saveLog(message, LOG_TYPES.INFO, data, ip);
  }
}

export const logger = new Logger();
