import { HttpException, HttpStatus } from '@nestjs/common';

export const gfErrors = {
  userNotFound() {
    return new HttpException('User not found', HttpStatus.NOT_FOUND);
  },
  userExists() {
    return new HttpException('User already exists', HttpStatus.CONFLICT);
  },
  noAccess() {
    return new HttpException('Access denied', HttpStatus.FORBIDDEN);
  },
  getDataExist: (name: string = '') => {
    return new HttpException(`${name} already exists`, HttpStatus.CONFLICT);
  },
  entityExists(name: string = 'Entity') {
    return new HttpException(`${name} already exists`, HttpStatus.CONFLICT);
  },
  misMatch(name: string = '') {
    return new HttpException(`${name} mismatch`.trim(), HttpStatus.CONFLICT);
  },
  notFound(entity = '') {
    return new HttpException(
      `${entity} Not found`.trim(),
      HttpStatus.NOT_FOUND,
    );
  },
  dataBroken(message = '') {
    return new HttpException(
      `${message ? `${message} - ` : ''}Data invalid`,
      HttpStatus.BAD_REQUEST,
    );
  },
  customError(message = '', status = HttpStatus.INTERNAL_SERVER_ERROR) {
    return new HttpException(message, status);
  },
  unexpected() {
    return new HttpException('Server error', HttpStatus.INTERNAL_SERVER_ERROR);
  },
  // remainTime in seconds
  getTooManyRequestsError(remainTime?: number) {
    const message = remainTime
      ? `Too many requests - try in ${remainTime} seconds`
      : 'Too many requests';
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  },
};
