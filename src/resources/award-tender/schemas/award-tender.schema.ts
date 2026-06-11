import mongoose, { Document, Model, Schema } from 'mongoose';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { TenderDocumentsLinks, TenderLot } from '@/resources/tenders/schemas';
import { filterModel } from '@/utils';
import { Contractor, ContractorDocument } from '@/resources/contractor/schemas';

export type AwardTenderWinner = Contractor;

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
  buyerMainActivities?: string[];
  publicationDate?: Date;
  dispatchDate?: Date;
  submissionDeadline?: Date;
  deadlineReceiptTender?: Date;
  plannedEndDate?: Date;
  contractNature?: TedContractNature | string;
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
  awardDecisionDate?: Date;
  selectionStatus?: string[];
  decisionDate?: string[];
  placeOfPerformanceCountries?: string[];
  placeOfPerformanceCities?: string[];
  lots?: TenderLot[];
  internalLotIdentifiers?: string[];
  winners: Array<mongoose.Types.ObjectId | ContractorDocument>;
  links?: TenderDocumentsLinks;
  sourceHash: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AwardTenderDocument = AwardTender & Document;
export type AwardTenderRecord = AwardTender & { _id: unknown };
export type AwardTenderSerializable = AwardTenderDocument | AwardTenderRecord;

export interface AwardTenderModelType extends Model<AwardTenderDocument> {
  toDetailDto(tender: AwardTenderSerializable): Partial<AwardTender>;
}

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
    buyerMainActivities: {
      type: [String],
    },
    publicationDate: { type: Date, index: true },
    dispatchDate: Date,
    submissionDeadline: { type: Date, index: true },
    deadlineReceiptTender: Date,
    plannedEndDate: { type: Date, index: true },
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
    awardDecisionDate: { type: Date, index: true },
    selectionStatus: { type: [String] },
    decisionDate: { type: [String] },
    placeOfPerformanceCountries: { type: [String] },
    placeOfPerformanceCities: { type: [String] },
    lots: { type: [Schema.Types.Mixed] },
    internalLotIdentifiers: { type: [String] },
    winners: {
      type: [Schema.Types.ObjectId],
      ref: 'Contractor',
      default: [],
    },
    links: Schema.Types.Mixed,
    sourceHash: { type: String, required: true, index: true },
  },
  {
    collection: 'award_tenders',
    timestamps: true,
  },
);

AwardTenderSchema.index({
  cpvCodes: 1,
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

AwardTenderSchema.statics.toDetailDto = function (
  tender: AwardTenderSerializable,
) {
  return filterModel(tender, {
    excludeFields: ['links', 'cpvCodes'],
  });
};

export const AwardTenderModel: AwardTenderModelType =
  (mongoose.models.AwardTender as AwardTenderModelType | undefined) ??
  mongoose.model<AwardTenderDocument, AwardTenderModelType>(
    'AwardTender',
    AwardTenderSchema,
  );
