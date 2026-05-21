import mongoose, { Document, Model, Schema } from 'mongoose';
import { filterModel, isPopulatedRecord } from '@/utils';
import { UserModel } from '@/resources/user/user.schema';
import { UserDocument } from '@/resources/user/user.types';

export interface Feedback {
  user?: mongoose.Types.ObjectId;
  email?: string;
  message: string;
  isRead: boolean;
  readAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FeedbackDocument = Feedback & Document;
export type FeedbackRecord = Feedback & {
  _id?: unknown;
  user?: mongoose.Types.ObjectId | UserDocument;
};
export type FeedbackSerializable = FeedbackDocument | FeedbackRecord;

export type FeedbackDto = Omit<FeedbackRecord, 'user'> & {
  user?: ReturnType<typeof UserModel.serializeUser> | null;
};

export interface FeedbackModelType extends Model<FeedbackDocument> {
  serialize(feedback?: FeedbackSerializable | null): FeedbackDto | null;
}

const FeedbackSchema = new Schema<FeedbackDocument, FeedbackModelType>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: undefined,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: undefined,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    collection: 'feedback',
    timestamps: true,
  },
);

FeedbackSchema.index({ createdAt: -1 });
FeedbackSchema.index({ isRead: 1, createdAt: -1 });

FeedbackSchema.statics.serialize = function (
  feedback?: FeedbackSerializable | null,
) {
  if (!feedback) {
    return null;
  }

  const result = filterModel(feedback);

  result.user = isPopulatedRecord(feedback.user)
    ? UserModel.serializeUser(feedback.user as UserDocument, true)
    : feedback.user?.toString();

  return result as FeedbackDto;
};

export const FeedbackModel: FeedbackModelType =
  (mongoose.models.Feedback as FeedbackModelType | undefined) ??
  mongoose.model<FeedbackDocument, FeedbackModelType>(
    'Feedback',
    FeedbackSchema,
  );
