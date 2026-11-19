import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { TenderModel, TenderSerializable } from '@/resources/tenders/schemas';
import { filterModel, isPopulatedRecord } from '@/utils';
import {
  isNationalTenderRecord,
  serializeNationalTenderDetail,
  serializeNationalTenderList,
  TED_TENDER_MODEL_NAME,
} from '@/resources/national-tenders/core/national-tender.serializer';
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
  /** Model of `tender`: absent/'Tender' for TED, 'NationalTender' for national. */
  tenderModel?: string;
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
  aiFitSummary: string;
  aiFitReasons: string[];
  aiFitRisks: string[];
  aiFitError: string | null;
  notificationStatus: NotificationStatus;
  staleReason?: MatchStaleReason | null;
  staleExplanation?: string | null;
  staleReasons?: string[];
  staleRisks?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderCompanyMatchDocument = TenderCompanyMatch & Document;
export type TenderCompanyMatchSerializable =
  | TenderCompanyMatchDocument
  | (TenderCompanyMatch & { _id: unknown });

export interface TenderCompanyMatchModelType extends Model<TenderCompanyMatchDocument> {
  serializeList(match?: TenderCompanyMatchSerializable | null): unknown | null;
  serializeDetail(
    match?: TenderCompanyMatchSerializable | null,
  ): unknown | null;
}

export const TenderCompanyMatchSchema = new Schema<TenderCompanyMatchDocument>(
  {
    tender: {
      type: Schema.Types.ObjectId,
      // Polymorphic: TED tenders (default) or national tenders.
      ref: function (this: { tenderModel?: string }) {
        return this.tenderModel || TED_TENDER_MODEL_NAME;
      },
      required: true,
      index: true,
    },
    tenderModel: String,
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
    aiFitSummary: {
      type: String,
      default: '',
    },
    aiFitReasons: {
      type: [String],
      default: [],
    },
    aiFitRisks: {
      type: [String],
      default: [],
    },
    aiFitError: {
      type: String,
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
    staleExplanation: {
      type: String,
      default: null,
    },
    staleReasons: {
      type: [String],
      default: [],
    },
    staleRisks: {
      type: [String],
      default: [],
    },
  },
  {
    collection: 'tender_company_matches',
    timestamps: true,
  },
);

TenderCompanyMatchSchema.index({ tender: 1, company: 1 }, { unique: true });
TenderCompanyMatchSchema.index({ hardMatchStatus: 1 });

function serializeMatchList(
  match?: TenderCompanyMatchSerializable | null,
): unknown | null {
  if (!match) {
    return null;
  }

  const { tender, company, companyTenderFilter, ...rest } = filterModel(
    match as TenderCompanyMatchDocument,
  );

  return {
    ...rest,
    tender: isNationalTenderRecord(tender)
      ? serializeNationalTenderList(tender)
      : TenderModel.serializeList(tender as unknown as TenderSerializable),
  };
}

function serializeMatchDetail(
  match?: TenderCompanyMatchSerializable | null,
): unknown | null {
  if (!match) {
    return null;
  }

  const { tender, company, companyTenderFilter, ...rest } = filterModel(
    match as TenderCompanyMatchDocument,
  ) as Record<string, unknown>;

  return {
    ...rest,
    tender: isNationalTenderRecord(tender)
      ? serializeNationalTenderDetail(tender)
      : isPopulatedRecord(tender)
        ? TenderModel.serializeDetail(tender as unknown as TenderSerializable)
        : tender,
  };
}

TenderCompanyMatchSchema.statics.serializeList = serializeMatchList;
TenderCompanyMatchSchema.statics.serializeDetail = serializeMatchDetail;

export const TenderCompanyMatchModel: TenderCompanyMatchModelType =
  (mongoose.models.TenderCompanyMatch as
    | TenderCompanyMatchModelType
    | undefined) ??
  mongoose.model<TenderCompanyMatchDocument, TenderCompanyMatchModelType>(
    'TenderCompanyMatch',
    TenderCompanyMatchSchema,
  );
