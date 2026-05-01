import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { logger } from '@/utils';

@Catch() // ловим любые исключения
export class HttpErrorLoggingFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Сообщение/детали
    const body = isHttp
      ? exception.getResponse()
      : { message: (exception as any)?.message ?? 'Internal error' };
    const stack = exception instanceof Error ? exception.stack : undefined;
    // ЛОГ
    logger.error(`${req.method} ${req.url} -> ${status}`, {
      body,
      stack,
      user: req.user ?? null,
    });

    throw exception;
  }
}
