import { Logger } from '@nestjs/common';
import { isDev } from './env';

type DevLogMessage = string | (() => string);

export function devLog(message: DevLogMessage, context?: string) {
  if (!isDev) {
    return;
  }

  Logger.debug(typeof message === 'function' ? message() : message, context);
}
