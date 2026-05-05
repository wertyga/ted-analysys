import { Document, Model, Types } from 'mongoose';
import { TSerializeOptions } from '@/types';

export enum USER_TYPE {
  TEMPORARY = 'TEMPORARY',
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export type TTypicalContractSize = {
  min?: number;
  max?: number;
  currency?: string;
};

export type TUser = {
  _id: string;
  email: string;
  hashPassword: string;
  password: string;
  token?: string;
  tempEmail?: string;
  recoveryToken?: string;
  oauthId?: string;
  status: USER_TYPE;
  companyName: string;
  country: string;
  operatingRegions: string[];
  companySize: number;
  companyDescription: string;
  industries: Types.ObjectId[];
  mainServices: Types.ObjectId[];
  languages: string[];
  certifications?: string[];
  capabilities?: string[];
  yearsOfExperience?: number;
  publicProcurementExperience?: boolean;
  typicalContractSize?: TTypicalContractSize;
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
