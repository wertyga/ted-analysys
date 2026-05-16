import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import {
  AiFitDecision,
  AiFitStatus,
  HardMatchStatus,
  MatchStaleReason,
  NotificationStatus,
  TenderMatchDecision,
} from '../tender-match.types';

export interface TenderCompanyMatch {
  tender: Types.ObjectId;
  company: Types.ObjectId;
  companyTenderFilter: Types.ObjectId;
  hardMatchStatus: HardMatchStatus;
  hardMatchScore: number;
  decision: TenderMatchDecision;
  reasons: string[];
  risks: string[];
  keywordHits: string[];
  aiFitStatus: AiFitStatus;
  aiFitScore: number | null;
  aiFitDecision: AiFitDecision | null;
  notificationStatus: NotificationStatus;
  staleReason?: MatchStaleReason | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderCompanyMatchDocument = TenderCompanyMatch & Document;

export const TenderCompanyMatchSchema = new Schema<TenderCompanyMatchDocument>(
  {
    tender: {
      type: Schema.Types.ObjectId,
      ref: 'Tender',
      required: true,
      index: true,
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    companyTenderFilter: {
      type: Schema.Types.ObjectId,
      ref: 'CompanyTenderFilter',
      required: true,
    },
    hardMatchStatus: {
      type: String,
      enum: HardMatchStatus,
      required: true,
    },
    hardMatchScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    decision: {
      type: String,
      enum: TenderMatchDecision,
      required: true,
    },
    reasons: {
      type: [String],
      default: [],
    },
    risks: {
      type: [String],
      default: [],
    },
    keywordHits: {
      type: [String],
      default: [],
    },
    aiFitStatus: {
      type: String,
      enum: AiFitStatus,
      default: AiFitStatus.NOT_STARTED,
    },
    aiFitScore: {
      type: Number,
      default: null,
    },
    aiFitDecision: {
      type: String,
      enum: [...Object.values(AiFitDecision), null],
      default: null,
    },
    notificationStatus: {
      type: String,
      enum: NotificationStatus,
      default: NotificationStatus.NOT_CREATED,
    },
    staleReason: {
      type: String,
      enum: [...Object.values(MatchStaleReason), null],
      default: null,
    },
  },
  {
    collection: 'tender_company_matches',
    timestamps: true,
  },
);

TenderCompanyMatchSchema.index({ tender: 1, company: 1 }, { unique: true });
TenderCompanyMatchSchema.index({ hardMatchStatus: 1 });

export const TenderCompanyMatchModel: Model<TenderCompanyMatchDocument> =
  (mongoose.models.TenderCompanyMatch as
    | Model<TenderCompanyMatchDocument>
    | undefined) ??
  mongoose.model<TenderCompanyMatchDocument>(
    'TenderCompanyMatch',
    TenderCompanyMatchSchema,
  );
