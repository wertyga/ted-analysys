import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { logger } from '@/utils';

@Catch()
export class HttpErrorLoggingFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const httpException = this.toHttpException(exception);
    const status = httpException.getStatus();
    const response = httpException.getResponse();
    const body =
      typeof response === 'string'
        ? {
            statusCode: status,
            message: response,
            error: httpException.name,
          }
        : response;
    const stack = exception instanceof Error ? exception.stack : undefined;

    logger.error(`${req.method} ${req.url} -> ${status}`, {
      body,
      stack,
      user: req.user ?? null,
    });

    res.status(status).json(body);
  }

  private toHttpException(exception: unknown): HttpException {
    if (exception instanceof HttpException) {
      return exception;
    }

    if (this.isBadRequestError(exception)) {
      return new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: exception instanceof Error ? exception.message : 'Bad request',
        error: 'Bad Request',
      });
    }

    return new HttpException(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          exception instanceof Error
            ? exception.message
            : 'Internal server error',
        error: 'Internal Server Error',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  private isBadRequestError(exception: unknown): boolean {
    if (!(exception instanceof Error)) {
      return false;
    }

    const message = exception.message.toLowerCase();

    return (
      exception.name === 'ValidationError' ||
      exception.name === 'CastError' ||
      exception.name === 'SyntaxError' ||
      message.includes('unsupported') ||
      message.includes('invalid') ||
      message.includes('not accepted') ||
      message.includes('not found')
    );
  }
}
