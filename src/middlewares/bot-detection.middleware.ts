import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const SEARCH_BOT_UA_REGEX =
  /googlebot|bingbot|yandexbot|duckduckbot|baiduspider|slurp|facebookexternalhit|twitterbot|linkedinbot|telegrambot|applebot|semrushbot|ahrefsbot|mj12bot|googleother|node|bot|crawler/i;

export function isSearchBot(userAgent?: string): boolean {
  if (!userAgent) return false;
  return SEARCH_BOT_UA_REGEX.test(userAgent);
}

@Injectable()
export class BotDetectionMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const userAgent = req.headers['user-agent'];

    req.isBot = isSearchBot(
      Array.isArray(userAgent) ? userAgent.join(' ') : userAgent,
    );

    next();
  }
}
