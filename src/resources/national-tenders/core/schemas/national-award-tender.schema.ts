import mongoose, { Document, Model, Schema } from 'mongoose';
import { TenderDurationSchema } from '@/resources/tenders/schemas';
import {
  NationalAwardLotStatus,
  NationalTenderSource,
  NormalizedNationalAwardLot,
} from '@/resources/national-tenders/core/national-tender.types';

type Money = { amount: number | null; currency: string | null };

/** Stored part: winner resolved to the shared `contractors` collection. */
export type NationalAwardTenderLot = Omit<
  NormalizedNationalAwardLot,
  'winner'
> & {
  estimatedValueEur?: number | null;
  awardValueEur?: number | null;
  winner?: mongoose.Types.ObjectId;
  isJointVenture?: boolean;
};

/**
 * Result of a national procedure (awarded / cancelled parts), e.g. BZP
 * `TenderResultNotice`. Separate from TED `award_tenders`; field names mirror
 * `AwardTender`, so its serializers and buyer/contractor stats read it as is.
 * Buyers and winners are the shared `buyers` / `contractors` records.
 */
export interface NationalAwardTender {
  _id: mongoose.Types.ObjectId;
  id: string;
  source: NationalTenderSource;
  sourceId: string;
  sourceProcedureId?: string;
  sourceUrl?: string;
  country: string;
  title?: string;
  contractNature?: string;
  cpvCodes: string[];
  publicationDate?: Date;
  estimatedValue?: Money;
  estimatedValueEur?: number | null;
  awardValue: Money;
  awardValueEur?: number | null;
  contractConclusionDates: Date[];
  awardDate: Date | null;
  placeOfPerformanceCountries: string[];
  lots: NationalAwardTenderLot[];
  winners: mongoose.Types.ObjectId[];
  leadBuyers: mongoose.Types.ObjectId[];
  nonLeadBuyers: mongoose.Types.ObjectId[];
  rawData?: unknown;
  sourceHash: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type NationalAwardTenderDocument = NationalAwardTender & Document;
export type NationalAwardTenderModelType = Model<NationalAwardTenderDocument>;

const MoneySchema = new Schema(
  {
    amount: { type: Number, default: null },
    currency: { type: String, default: null },
  },
  { _id: false },
);

const NationalAwardTenderLotSchema = new Schema<NationalAwardTenderLot>(
  {
    identifier: { type: String, required: true },
    title: String,
    description: String,
    contractNature: String,
    mainClassification: { type: [String], default: [] },
    estimatedValue: MoneySchema,
    estimatedValueEur: { type: Number, default: null },
    status: {
      type: String,
      enum: [
        'awarded',
        'cancelled',
        'unresolved',
      ] satisfies NationalAwardLotStatus[],
    },
    cancellationReason: String,
    offersCount: Number,
    smeOffersCount: Number,
    lowestOfferValue: MoneySchema,
    highestOfferValue: MoneySchema,
    awardValue: MoneySchema,
    awardValueEur: { type: Number, default: null },
    contractConclusionDate: Date,
    duration: { type: TenderDurationSchema },
    winner: { type: Schema.Types.ObjectId, ref: 'Contractor' },
    isJointVenture: Boolean,
  },
  { _id: false },
);

const NationalAwardTenderSchema = new Schema<NationalAwardTenderDocument>(
  {
    id: { type: String, required: true, unique: true },
    source: {
      type: String,
      enum: Object.values(NationalTenderSource),
      required: true,
    },
    sourceId: { type: String, required: true },
    sourceProcedureId: String,
    sourceUrl: String,
    country: { type: String, required: true },
    title: String,
    contractNature: String,
    cpvCodes: { type: [String], default: [] },
    publicationDate: Date,
    estimatedValue: MoneySchema,
    estimatedValueEur: { type: Number, default: null },
    awardValue: MoneySchema,
    awardValueEur: { type: Number, default: null },
    contractConclusionDates: { type: [Date], default: [] },
    awardDate: { type: Date, default: null },
    placeOfPerformanceCountries: { type: [String], default: [] },
    lots: { type: [NationalAwardTenderLotSchema], default: [] },
    winners: [{ type: Schema.Types.ObjectId, ref: 'Contractor' }],
    leadBuyers: [{ type: Schema.Types.ObjectId, ref: 'Buyer' }],
    nonLeadBuyers: [{ type: Schema.Types.ObjectId, ref: 'Buyer' }],
    rawData: { type: Schema.Types.Mixed, select: false },
    sourceHash: { type: String, required: true },
  },
  { collection: 'national_award_tenders', timestamps: true },
);

NationalAwardTenderSchema.index(
  { source: 1, publicationDate: -1 },
  { name: 'idx_source_pubdate' },
);
NationalAwardTenderSchema.index(
  { source: 1, sourceProcedureId: 1 },
  { name: 'idx_source_procedure' },
);
NationalAwardTenderSchema.index(
  { winners: 1, publicationDate: -1 },
  { name: 'idx_winners' },
);
NationalAwardTenderSchema.index(
  { leadBuyers: 1, publicationDate: -1 },
  { name: 'idx_lead_buyers' },
);
// Sorting of the shared /awards lists (same as TED award_tenders).
NationalAwardTenderSchema.index(
  { awardDate: -1, _id: -1 },
  { name: 'idx_award_date' },
);
NationalAwardTenderSchema.index(
  { awardValueEur: -1, _id: -1 },
  { name: 'idx_award_value' },
);
NationalAwardTenderSchema.index(
  { publicationDate: -1, _id: -1 },
  { name: 'idx_pubdate' },
);

export const NationalAwardTenderModel: NationalAwardTenderModelType =
  (mongoose.models.NationalAwardTender as
    | NationalAwardTenderModelType
    | undefined) ??
  mongoose.model<NationalAwardTenderDocument>(
    'NationalAwardTender',
    NationalAwardTenderSchema,
  );
