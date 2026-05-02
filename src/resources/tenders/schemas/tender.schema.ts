import mongoose, { Document, Model, Schema } from 'mongoose';

export interface Tender {
  id: string;
  source: string;
  sourceNoticeId?: string;
  publicationNumber?: string;
  noticeType?: string;
  procedureType?: string;
  title?: string;
  buyerName?: string;
  buyerCountry?: string;
  publicationDate?: string;
  submissionDeadline?: string;
  contractNature?: string;
  classificationCpv?: unknown[];
  cpvCodes?: unknown[];
  links?: unknown;
  lastSeenAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderDocument = Tender & Document;

const TenderSchema = new Schema<TenderDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    source: { type: String, required: true, index: true },
    sourceNoticeId: { type: String, index: true },
    publicationNumber: { type: String, index: true },
    noticeType: String,
    procedureType: String,
    title: String,
    buyerName: String,
    buyerCountry: String,
    publicationDate: String,
    submissionDeadline: String,
    contractNature: String,
    classificationCpv: { type: [Schema.Types.Mixed], default: undefined },
    cpvCodes: { type: [Schema.Types.Mixed], default: undefined },
    links: Schema.Types.Mixed,
    lastSeenAt: { type: Date, required: true },
  },
  {
    collection: 'tenders',
    timestamps: true,
  },
);

export const TenderModel: Model<TenderDocument> =
  (mongoose.models.Tender as Model<TenderDocument> | undefined) ??
  mongoose.model<TenderDocument>('Tender', TenderSchema);
