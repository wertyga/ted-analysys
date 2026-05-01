import { Request } from 'express';

export const getOrigin = (req: Request) => {
  return req.headers.origin || `https://${req.headers.host}`;
};
