import { model, Schema } from 'mongoose';
import {
  COMPANY_SIZE,
  TUser as UserType,
  USER_TYPE,
  UserDocument,
  UserMethods,
} from './user.types';
import { filterModel, generateHash } from '@/utils';
import { TSerializeOptions } from '@/types';
import { USER_LIST_FIELDS } from './user.dto';

export const UserSchema = new Schema<UserType>(
  {
    email: {
      type: String,
      unique: true,
      require: true,
    },
    tempEmail: String,
    token: {
      type: String,
    },
    recoveryToken: {
      type: String,
    },
    hashPassword: {
      type: String,
    },
    oauthId: {
      type: String,
    },
    status: {
      type: String,
      enum: USER_TYPE,
      require: true,
    },
    companyName: {
      type: String,
    },
    country: {
      type: String,
    },
    operatingRegions: {
      type: [String],
      default: [],
    },
    companySize: {
      type: String,
      enum: COMPANY_SIZE,
    },
    companyDescription: {
      type: String,
    },
    industries: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      default: [],
    },
    mainServices: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      default: [],
    },
    languages: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

function serializeUser(
  user?: UserDocument,
  guest?: boolean,
  options?: TSerializeOptions,
  isAdminFetch?: boolean,
) {
  if (!user) {
    return null;
  }

  const {
    hashPassword,
    updatedAt,
    recoveryToken,
    tempEmail,
    status,
    oauthId,
    ...rest
  } = filterModel('toObject' in user ? user.toObject() : user, options);

  const result = {
    ...rest,
  };

  if (guest) {
    delete result.token;
  }

  if (isAdminFetch) {
    result.status = status;
  }

  return result;
}

UserSchema.virtual('password').get(function (this: UserDocument) {
  return this.hashPassword;
});
UserSchema.virtual('password').set(function (password) {
  this.hashPassword = generateHash(password);
});

UserSchema.statics.serializeUser = serializeUser;

UserSchema.statics.serializeListUser = function (user: UserDocument) {
  return serializeUser(
    filterModel(user, {
      includeFields: USER_LIST_FIELDS,
    }),
    true,
  );
};

export const UserModel = model<UserType, UserMethods>('User', UserSchema);
