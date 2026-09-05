import mongoose, { Document, Model, Schema } from 'mongoose';
import { filterModel } from '@/utils';

export enum XPostPillar {
  InterestingTender = 'interesting_tender',
  MarketInsight = 'market_insight',
  ContractAward = 'contract_award',
  ProcurementInsight = 'procurement_insight',
}

export enum XPostFormat {
  Single = 'single',
  Thread = 'thread',
}

export enum XPostStatus {
  Draft = 'draft',
  Approved = 'approved',
  Published = 'published',
}

export enum XPostSource {
  Ai = 'ai',
  Manual = 'manual',
}

export interface XPost {
  topic: string;
  pillar?: XPostPillar;
  format: XPostFormat;
  posts: string[];
  hashtags: string[];
  status: XPostStatus;
  source: XPostSource;
  notes?: string;
  llmProvider?: string;
  llmModel?: string;
  imageUrl?: string;
  imageGeneratedAt?: Date;
  /** Ids of the real tender/award records the AI generator grounded this post in. */
  sourceIds: string[];
  /** Human-readable summary of the source record(s), for admin verification. */
  sourceSummary?: string;
  createdBy?: mongoose.Types.ObjectId;
  publishedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type XPostDocument = XPost & Document;
export type XPostRecord = XPost & { _id?: unknown };
export type XPostDto = XPostRecord;

export interface XPostModelType extends Model<XPostDocument> {
  serialize(xPost?: XPostDocument | XPostRecord | null): XPostDto | null;
}

const XPostSchema = new Schema<XPostDocument, XPostModelType>(
  {
    topic: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    pillar: {
      type: String,
      enum: Object.values(XPostPillar),
      default: undefined,
      index: true,
    },
    format: {
      type: String,
      enum: Object.values(XPostFormat),
      required: true,
      default: XPostFormat.Single,
    },
    posts: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) =>
          Array.isArray(value) && value.length > 0,
        message: 'posts must contain at least one post',
      },
    },
    hashtags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(XPostStatus),
      required: true,
      default: XPostStatus.Draft,
      index: true,
    },
    source: {
      type: String,
      enum: Object.values(XPostSource),
      required: true,
      default: XPostSource.Ai,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: undefined,
    },
    llmProvider: {
      type: String,
      default: undefined,
    },
    llmModel: {
      type: String,
      default: undefined,
    },
    imageUrl: {
      type: String,
      default: undefined,
    },
    imageGeneratedAt: {
      type: Date,
      default: undefined,
    },
    sourceIds: {
      type: [String],
      default: [],
    },
    sourceSummary: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: undefined,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
    publishedAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    collection: 'x_posts',
    timestamps: true,
  },
);

XPostSchema.index({ createdAt: -1 });
XPostSchema.index({ status: 1, createdAt: -1 });

XPostSchema.statics.serialize = function (xPost) {
  if (!xPost) {
    return null;
  }

  return filterModel(xPost) as XPostDto;
};

export const XPostModel: XPostModelType =
  (mongoose.models.XPost as XPostModelType | undefined) ??
  mongoose.model<XPostDocument, XPostModelType>('XPost', XPostSchema);
