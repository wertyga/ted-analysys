import { Document, Model } from 'mongoose';
import { TSerializeOptions } from '@/types';

export enum USER_TYPE {
  TEMPORARY = 'TEMPORARY',
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export type TUser = {
  _id: string;
  username: string;
  email: string;
  hashPassword: string;
  password: string;
  token?: string;
  tempEmail?: string;
  recoveryToken?: string;
  oauthId?: string;
  status: USER_TYPE;
  createdAt: string;
  updatedAt: string;
};

export interface UserMethods extends Model<UserDocument> {
  serializeUser: (
    user?: UserDocument,
    guest?: string,
    options?: TSerializeOptions,
    isAdminFetch?: boolean,
  ) => TUser;
  serializeListUser: (user: UserDocument) => TUser;
}

export type UserDocument = Document & TUser & {};
