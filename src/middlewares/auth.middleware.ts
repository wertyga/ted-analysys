import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { UserModel } from '@/resources/user/user.schema';
import { USER_TYPE } from '@/resources/user/user.types';

@Injectable()
export class GetUserMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    const userToken = (req.headers.authorization || '').replace('Bearer ', '');

    if (!userToken) {
      return next();
    }

    const dbUser: any = await UserModel.findOne({ token: userToken });

    if (dbUser) {
      dbUser.isAdmin = [USER_TYPE.ADMIN, USER_TYPE.SUPER_ADMIN].includes(
        dbUser.status,
      );

      req.user = dbUser;
    }

    next();
  }
}
