import mongoose, { Document, Schema, Types } from 'mongoose';
import { AiFitDecision } from '@/resources/tender-matching/tender-match.types';
import { UserNotificationFrequency } from '@/resources/user/user.types';

export interface TenderMatchNotificationLog {
  user: Types.ObjectId;
  match: Types.ObjectId;
  tender: Types.ObjectId;
  aiFitDecision: AiFitDecision;
  frequency: UserNotificationFrequency;
  sentAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderMatchNotificationLogDocument = TenderMatchNotificationLog &
  Document;

export const TenderMatchNotificationLogSchema =
  new Schema<TenderMatchNotificationLogDocument>(
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },
      match: {
        type: Schema.Types.ObjectId,
        ref: 'TenderCompanyMatch',
        required: true,
        index: true,
      },
      tender: {
        type: Schema.Types.ObjectId,
        ref: 'Tender',
        required: true,
      },
      aiFitDecision: {
        type: String,
        enum: AiFitDecision,
        required: true,
      },
      frequency: {
        type: String,
        enum: UserNotificationFrequency,
        required: true,
      },
      sentAt: {
        type: Date,
        required: true,
      },
    },
    {
      collection: 'tender_match_notification_logs',
      timestamps: true,
    },
  );

TenderMatchNotificationLogSchema.index(
  { user: 1, match: 1, frequency: 1 },
  { unique: true },
);

export const TenderMatchNotificationLogModel =
  (mongoose.models
    .TenderMatchNotificationLog as mongoose.Model<TenderMatchNotificationLogDocument> | undefined) ??
  mongoose.model<TenderMatchNotificationLogDocument>(
    'TenderMatchNotificationLog',
    TenderMatchNotificationLogSchema,
  );
