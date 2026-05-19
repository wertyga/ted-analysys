import { Document, Model, Types } from 'mongoose';
import { TSerializeOptions } from '@/types';
import type { CurrencySign } from '@/resources/codelist';
import { AiFitDecision } from '@/resources/tender-matching/tender-match.types';

export enum USER_TYPE {
  TEMPORARY = 'TEMPORARY',
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export type TTypicalContractSize = {
  min?: number;
  max?: number;
  currency?: CurrencySign;
};

export enum UserNotificationFrequency {
  INSTANT = 'instant',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  DISABLED = 'disabled',
}

export type TUserNotificationSettings = Partial<
  Record<
    Exclude<AiFitDecision, AiFitDecision.REJECT>,
    UserNotificationFrequency
  >
>;

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
  operatingCountries: string[];
  companySize: number;
  companyDescription: string;
  industries: Types.ObjectId[];
  mainServices: Types.ObjectId[];
  languages: string[];
  minDaysBeforeDeadline: number;
  certifications?: string[];
  capabilities?: string[];
  yearsOfExperience?: number;
  publicProcurementExperience?: boolean;
  typicalContractSize?: TTypicalContractSize;
  notifications?: TUserNotificationSettings;
  createdAt: string;
  updatedAt: string;
};

export interface UserMethods extends Model<UserDocument> {
  serializeUser: (
    user?: UserDocument,
    guest?: boolean,
    options?: TSerializeOptions,
    isAdminFetch?: boolean,
  ) => TUser;
  serializeListUser: (user: UserDocument) => TUser;
}

export type UserDocument = Document & TUser & {};
