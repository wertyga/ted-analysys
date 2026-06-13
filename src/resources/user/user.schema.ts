import { model, Schema } from 'mongoose';
import {
  TUser as UserType,
  USER_TYPE,
  UserNotificationFrequency,
  UserDocument,
  UserMethods,
} from './user.types';
import { filterModel, generateHash } from '@/utils';
import { TSerializeOptions } from '@/types';
import { USER_LIST_FIELDS } from './user.dto';
import { CurrencySign } from '@/resources/codelist';
import { AiFitDecision } from '@/resources/tender-matching/tender-match.types';

const userNotificationFrequencyField = {
  type: String,
  enum: Object.values(UserNotificationFrequency),
  default: UserNotificationFrequency.DISABLED,
};

export const UserSchema = new Schema<UserType>(
  {
    email: {
      type: String,
      unique: true,
      require: true,
    },
    tempEmail: String,
    tempFreeUseCouponCode: String,
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
    operatingCountries: {
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
    minDaysBeforeDeadline: {
      type: Number,
      default: 7,
    },
    certifications: {
      type: [String],
      default: [],
    },
    capabilities: {
      type: [String],
      default: [],
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
    notifications: {
      [AiFitDecision.MAYBE]: userNotificationFrequencyField,
      [AiFitDecision.GOOD_FIT]: userNotificationFrequencyField,
      [AiFitDecision.STRONG_FIT]: userNotificationFrequencyField,
    },
  },
  { timestamps: true },
);

function serializeUser(
  user?: UserDocument | null,
  guest?: boolean,
  options?: TSerializeOptions<UserDocument>,
  isAdminFetch?: boolean,
) {
  if (!user) {
    return null;
  }

  const userFields = filterModel(user, {
    excludeFields: [
      'hashPassword',
      'updatedAt',
      'recoveryToken',
      'tempEmail',
      'tempFreeUseCouponCode',
      'status',
      'oauthId',
      ...(options?.excludeFields ?? []),
    ],
    includeFields: options?.includeFields,
  });

  const result = {
    ...userFields,
  };

  if (guest) {
    delete result.token;
  }

  if (isAdminFetch) {
    result.status = user.status;
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
UserSchema.statics.serializeUser = serializeUser;

UserSchema.statics.serializeListUser = function (user: UserDocument) {
  return serializeUser(
    filterModel(user, {
      includeFields: USER_LIST_FIELDS.split(' ') as (keyof UserDocument)[],
    }),
    true,
  );
};

export const UserModel = model<UserType, UserMethods>('User', UserSchema);
