import mongoose, { Document, Model, Schema } from 'mongoose';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { TenderDocumentsLinks } from '@/resources/tenders/schemas';
import { filterModel } from '@/utils';

export interface AwardTenderWinner {
  name?: string;
  identifier?: string;
  country?: string;
  countrySub?: string;
  city?: string;
  postCode?: string;
  size?: string;
  listed?: string;
  selectionStatus?: string;
  decisionDate?: Date;
}

export interface AwardTender {
  _id: string;
  id: string;
  sourceNoticeId?: string;
  publicationNumber?: string;
  noticeType?: string;
  noticeSubtype?: string;
  noticeVersion?: string;
  procedureType?: string;
  title?: string;
  titleProc?: string;
  titleLot?: string[];
  description?: string;
  descriptionLot?: string[];
  buyerName?: string;
  buyerIdentifier?: string;
  buyerCountry?: string;
  buyerCity?: string;
  publicationDate?: Date;
  dispatchDate?: Date;
  contractNature?: TedContractNature | string;
  cpvDivision: string[];
  cpvCodes?: string[];
  classificationCpv?: unknown[];
  mainClassificationProc?: unknown[];
  mainClassificationLot?: unknown[];
  additionalClassificationLot?: unknown[];
  estimatedValue?: {
    amount: number | null;
    currency: string | null;
  };
  estimatedValueEur?: number | null;
  winners: AwardTenderWinner[];
  links?: TenderDocumentsLinks;
  rawNotice?: Record<string, unknown>;
  sourceHash: string;
  searchHash?: string;
  searchCacheExpiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AwardTenderDocument = AwardTender & Document;
export type AwardTenderRecord = AwardTender & { _id: unknown };
export type AwardTenderSerializable = AwardTenderDocument | AwardTenderRecord;

export interface AwardTenderModelType extends Model<AwardTenderDocument> {
  toDetailDto(tender: AwardTenderSerializable): Partial<AwardTender>;
}

const AwardTenderWinnerSchema = new Schema<AwardTenderWinner>(
  {
    name: { type: String, trim: true, default: undefined },
    identifier: { type: String, trim: true, default: undefined },
    country: { type: String, trim: true, uppercase: true, default: undefined },
    countrySub: { type: String, trim: true, default: undefined },
    city: { type: String, trim: true, default: undefined },
    postCode: { type: String, trim: true, default: undefined },
    size: { type: String, trim: true, default: undefined },
    listed: { type: String, trim: true, default: undefined },
    selectionStatus: { type: String, trim: true, default: undefined },
    decisionDate: { type: Date, default: undefined },
  },
  { _id: false },
);

const AwardTenderSchema = new Schema<AwardTenderDocument, AwardTenderModelType>(
  {
    id: { type: String, required: true, index: true },
    sourceNoticeId: { type: String, index: true },
    publicationNumber: { type: String, index: true },
    noticeType: { type: String, index: true },
    noticeSubtype: String,
    noticeVersion: String,
    procedureType: String,
    title: String,
    titleProc: String,
    titleLot: { type: [String] },
    description: String,
    descriptionLot: { type: [String] },
    buyerName: String,
    buyerIdentifier: String,
    buyerCountry: { type: String, index: true },
    buyerCity: String,
    publicationDate: { type: Date, index: true },
    dispatchDate: Date,
    contractNature: {
      type: String,
      enum: TedContractNature,
    },
    cpvCodes: { type: [String], index: true },
    classificationCpv: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      default: [],
    },
    mainClassificationProc: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      default: [],
    },
    mainClassificationLot: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      default: [],
    },
    additionalClassificationLot: {
      type: [Schema.Types.ObjectId],
      ref: 'CpvCategory',
      default: [],
    },
    estimatedValue: {
      amount: { type: Number, default: null },
      currency: { type: String, default: null },
    },
    estimatedValueEur: { type: Number, default: null, index: true },
    winners: {
      type: [AwardTenderWinnerSchema],
      default: [],
    },
    links: Schema.Types.Mixed,
    searchHash: { type: String, index: true },
    searchCacheExpiresAt: {
      type: Date,
    },
  },
  {
    collection: 'award_tenders',
    timestamps: true,
  },
);

AwardTenderSchema.index({
  cpvDivision: 1,
  buyerCountry: 1,
  contractNature: 1,
  publicationDate: -1,
});
AwardTenderSchema.index(
  { id: 1, searchHash: 1 },
  {
    unique: true,
    partialFilterExpression: { searchHash: { $exists: true } },
  },
);
AwardTenderSchema.index({ 'winners.identifier': 1 });
AwardTenderSchema.index({ 'winners.name': 1 });
AwardTenderSchema.index({ searchCacheExpiresAt: 1 }, { expireAfterSeconds: 0 });

AwardTenderSchema.statics.toDetailDto = function (
  tender: AwardTenderSerializable,
) {
  return filterModel(tender, {
    excludeFields: ['searchHash', 'searchCacheExpiresAt', 'links', 'cpvCodes'],
  });
};

export const AwardTenderModel: AwardTenderModelType =
  (mongoose.models.AwardTender as AwardTenderModelType | undefined) ??
  mongoose.model<AwardTenderDocument, AwardTenderModelType>(
    'AwardTender',
    AwardTenderSchema,
  );
