import { model, Schema } from 'mongoose';
import {
  TUser as UserType,
  USER_TYPE,
  UserDocument,
  UserMethods,
} from './user.types';
import { filterModel, generateHash } from '@/utils';
import { TSerializeOptions } from '@/types';
import { USER_LIST_FIELDS } from './user.dto';
import { CurrencySign } from '@/resources/codelist';

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
      type: Number,
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
    certifications: {
      type: [String],
      default: undefined,
    },
    capabilities: {
      type: [String],
      default: undefined,
    },
    yearsOfExperience: {
      type: Number,
      default: undefined,
    },
    publicProcurementExperience: {
      type: Boolean,
      default: undefined,
    },
    typicalContractSize: {
      min: { type: Number, default: undefined },
      max: { type: Number, default: undefined },
      currency: {
        type: String,
        enum: Object.values(CurrencySign),
        default: undefined,
      },
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
