import mongoose, { Document, Model, Schema } from 'mongoose';
import { TenderDto } from '../dto/tender.dto';

export type TenderDocument = TenderDto &
  Document & {
    source?: string;
    rawJson?: unknown;
    normalizedJson?: TenderDto;
    lastSeenAt?: Date;
  };

const TenderCpvSchema = new Schema(
  {
    code: { type: String, required: true },
    label: String,
    parentCode: String,
  },
  { _id: false },
);

const TenderValueSchema = new Schema(
  {
    amount: Number,
    currency: String,
  },
  { _id: false },
);

const TenderLotSchema = new Schema(
  {
    id: String,
    title: String,
    description: String,
    cpvCodes: { type: [TenderCpvSchema], default: [] },
    estimatedValue: TenderValueSchema,
  },
  { _id: false },
);

const TenderSchema = new Schema<TenderDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    source: { type: String, index: true },
    sourceNoticeId: String,
    publicationNumber: { type: String, index: true },
    title: String,
    description: String,
    buyerName: String,
    buyerCountry: String,
    buyerCity: String,
    publicationDate: String,
    deadline: String,
    cpvCodes: { type: [TenderCpvSchema], default: [] },
    noticeType: String,
    procedureType: String,
    estimatedValue: TenderValueSchema,
    lots: { type: [TenderLotSchema], default: [] },
    tedUrl: String,
    raw: Schema.Types.Mixed,
    rawJson: Schema.Types.Mixed,
    normalizedJson: Schema.Types.Mixed,
    lastSeenAt: Date,
  },
  {
    collection: 'tenders',
    timestamps: true,
  },
);

export const TenderModel: Model<TenderDocument> =
  mongoose.models.Tender ??
  mongoose.model<TenderDocument>('Tender', TenderSchema);
