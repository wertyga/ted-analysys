import { UserDocument } from '@/resourses/users/types';

declare global {
  namespace Express {
    interface Request extends OwnerModels {
      user: UserDocument & { isAdmin: boolean };
    }
  }
}
