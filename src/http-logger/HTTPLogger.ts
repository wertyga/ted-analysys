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

    if (!this.isUnknownRouteNotFound(status, body, req)) {
      logger.error(
        `${req.method} ${req.url} -> ${status}`,
        {
          body,
          stack,
          user: req.user ?? null,
        },
        this.getClientIp(req),
      );
    }

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

  private isUnknownRouteNotFound(
    status: number,
    body: string | object,
    req: Request,
  ): boolean {
    if (status !== HttpStatus.NOT_FOUND || typeof body !== 'object') {
      return false;
    }

    const message = (body as { message?: unknown }).message;

    return (
      typeof message === 'string' &&
      message === `Cannot ${req.method} ${req.url}`
    );
  }

  private getClientIp(req: Request): string | null {
    const forwardedFor = this.firstHeaderValue(req.headers['x-forwarded-for']);

    return (
      forwardedFor?.split(',')[0]?.trim() ||
      this.firstHeaderValue(req.headers['x-real-ip']) ||
      this.firstHeaderValue(req.headers['cf-connecting-ip']) ||
      req.ip ||
      req.socket.remoteAddress ||
      null
    );
  }

  private firstHeaderValue(
    header: string | string[] | undefined,
  ): string | null {
    if (Array.isArray(header)) {
      return header[0] ?? null;
    }

    return header ?? null;
  }
}
