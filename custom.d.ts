import { UserDocument } from '@/resources/user/user.types';

declare global {
  namespace Express {
    interface Request extends OwnerModels {
      user?: UserDocument & { isAdmin: boolean };
      isBot?: boolean;
    }
  }
}
