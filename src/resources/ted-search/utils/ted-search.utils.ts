import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import {
  TedDeadlineRange,
  TedTenderSearchRequestDto,
} from '../dto/ted-tender-search-request.dto';

export function getTedDate(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

export function resolveDeadlineRange(
  filters: TedTenderSearchRequestDto,
): TedTenderSearchRequestDto {
  const today = new Date();
  const todayTedDate = getTedDate(today);

  switch (filters.submissionDeadlineRange) {
    case TedDeadlineRange.ANY_OPEN:
      return {
        ...filters,
        submissionDeadlineFrom: todayTedDate,
        submissionDeadlineTo: undefined,
      };

    case TedDeadlineRange.NEXT_7_DAYS:
      return withNextDaysDeadline(filters, today, 7);

    case TedDeadlineRange.NEXT_14_DAYS:
      return withNextDaysDeadline(filters, today, 14);

    case TedDeadlineRange.NEXT_30_DAYS:
      return withNextDaysDeadline(filters, today, 30);

    default:
      return filters;
  }
}

export function withNextDaysDeadline(
  filters: TedTenderSearchRequestDto,
  from: Date,
  days: number,
): TedTenderSearchRequestDto {
  const to = new Date(from);
  to.setDate(to.getDate() + days);

  return {
    ...filters,
    submissionDeadlineFrom: getTedDate(from),
    submissionDeadlineTo: getTedDate(to),
  };
}

export function mapTedError(
  error: unknown,
  logger: Logger,
  isAxiosError: (error: unknown) => error is AxiosError,
): HttpException {
  if (isAxiosError(error)) {
    const status = error.response?.status;

    logger.error(
      `TED Search API request failed: status=${status ?? 'network'} code=${
        error.code ?? 'unknown'
      }`,
    );

    if (status === 400) {
      return new BadRequestException(
        'TED query syntax is invalid or request body is not accepted',
      );
    }

    if (status === 429) {
      return new HttpException('TED API rate limit exceeded', 429);
    }

    if (status === undefined) {
      return new ServiceUnavailableException('TED API is unavailable');
    }

    if (status >= 500) {
      return new ServiceUnavailableException(
        'TED API is temporarily unavailable',
      );
    }
  } else {
    logger.error('TED Search API request failed with a non-Axios error');
  }

  return new InternalServerErrorException(
    'TED API request failed unexpectedly',
  );
}
