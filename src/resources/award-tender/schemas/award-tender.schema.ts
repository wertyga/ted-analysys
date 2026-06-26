import mongoose, { Document, Model, Schema } from 'mongoose';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import {
  MoneyValue,
  TenderDocumentsLinks,
  TenderLot,
} from '@/resources/tenders/schemas';
import { filterModel } from '@/utils';
import { ContractorDocument } from '@/resources/contractor/schemas';
import { BuyerDocument } from '@/resources/buyer/schemas';

export type AwardTenderLot = TenderLot & {
  resultLotIdentifier: string;
  awardValue?: {
    amount: MoneyValue;
    currency: string | null;
  };
  awardValueEur?: MoneyValue;
};

export interface AwardTender {
  _id: string;
  id: string;
  noticeType?: string;
  noticeSubtype?: string;
  noticeVersion?: string;
  procedureType?: string;
  title?: string;
  titleProc?: string;
  description?: string;
  buyer: BuyerDocument;
  publicationDate?: Date;
  dispatchDate?: Date;
  submissionDeadline?: Date;
  plannedEndDate: Date | undefined;
  contractNature?: TedContractNature | string;
  cpvCodes: string[];
  mainClassificationProc?: unknown[];

  estimatedValue: {
    amount: MoneyValue;
    currency: string | null;
  };
  awardValue: {
    amount: MoneyValue;
    currency: string | null;
  };
  estimatedValueEur: MoneyValue;
  awardValueEur: MoneyValue;

  awardDecisionDates: string[];
  selectionStatuses: string[];
  isFrameworkAgreement?: boolean;
  placeOfPerformanceCountriesProc: string[];
  placeOfPerformanceCitiesProc: string[];
  placeOfPerformanceCountries: string[];
  placeOfPerformanceCities: string[];
  placeOfPerformanceSubdivisions: string[];

  lots: AwardTenderLot[];

  selectionCriteriaSources: string[];

  winners: Array<mongoose.Types.ObjectId | ContractorDocument>;
  links: TenderDocumentsLinks;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AwardTenderDocument = AwardTender & Document;
export type AwardTenderRecord = AwardTender & { _id: unknown };
export type AwardTenderSerializable = AwardTenderDocument | AwardTenderRecord;

export interface AwardTenderModelType extends Model<AwardTenderDocument> {
  toDetailDto(tender: AwardTenderSerializable): Partial<AwardTender>;
}

const AwardTenderLotValueSchema = new Schema(
  {
    amount: { type: Number, default: null },
    currency: { type: String, default: null },
  },
  { _id: false },
);

const AwardTenderLotSchema = new Schema<AwardTenderLot>(
  {
    identifier: String,
    resultLotIdentifier: String,
    title: String,
    description: String,
    mainClassification: { type: [String], default: [] },
    additionalClassifications: { type: [String], default: [] },
    contractNature: String,

    estimatedValue: { type: AwardTenderLotValueSchema },
    awardValue: { type: AwardTenderLotValueSchema },
    estimatedValueEur: { type: Number, default: null, index: true },
    awardValueEur: { type: Number, default: null, index: true },
    isFrameworkAgreement: Boolean,
    isDps: Boolean,

    frameworkMaximumValue: {
      type: AwardTenderLotValueSchema,
    },
    duration: {
      value: { type: Number, default: null },
      unit: String,
    },
    deadlineReceiptTender: Date,
    documentUrls: { type: [String], default: [] },
    submissionUrls: { type: [String], default: [] },
    electronicSubmission: String,
    plannedEndDate: { type: Date },
    placeOfPerformanceCountry: String,
    placeOfPerformanceSubdivision: String,
    placeOfPerformanceCity: String,
    awardCriteria: { type: Schema.Types.Mixed },
    selectionCriteria: { type: Schema.Types.Mixed },
    selectionCriteriaSource: String,
  },
  { _id: false, strict: false },
);

const AwardTenderSchema = new Schema<AwardTenderDocument, AwardTenderModelType>(
  {
    id: { type: String, required: true, unique: true },
    noticeType: { type: String },
    noticeSubtype: String,
    noticeVersion: String,
    procedureType: String,
    title: String,
    titleProc: String,
    description: String,
    buyer: {
      type: Schema.Types.ObjectId,
      ref: 'Buyer',
      required: true,
    },
    selectionStatuses: { type: [String], default: [] },
    publicationDate: { type: Date },
    dispatchDate: Date,
    submissionDeadline: { type: Date },
    plannedEndDate: { type: Date },
    contractNature: {
      type: String,
      enum: TedContractNature,
    },
    cpvCodes: { type: [String] },
    mainClassificationProc: {
      type: [String],
      default: [],
    },
    isFrameworkAgreement: Boolean,
    estimatedValue: {
      amount: { type: Number, default: null },
      currency: { type: String, default: null },
    },
    awardValue: {
      amount: { type: Number, default: null },
      currency: { type: String, default: null },
    },
    estimatedValueEur: { type: Number, default: null },
    awardValueEur: { type: Number, default: null },
    awardDecisionDates: { type: [String], default: [] },
    placeOfPerformanceCitiesProc: { type: [String], default: [] },
    placeOfPerformanceCountriesProc: { type: [String], default: [] },
    placeOfPerformanceCountries: { type: [String], default: [] },
    placeOfPerformanceCities: { type: [String], default: [] },
    placeOfPerformanceSubdivisions: { type: [String], default: [] },

    lots: { type: [AwardTenderLotSchema], default: [] },

    selectionCriteriaSources: { type: [String], default: [] },

    winners: {
      type: [Schema.Types.ObjectId],
      ref: 'Contractor',
      default: [],
    },
    links: Schema.Types.Mixed,
  },
  {
    collection: 'award_tenders',
    timestamps: true,
  },
);

AwardTenderSchema.index({
  cpvCodes: 1,
  buyerCountry: 1, // TODO
  contractNature: 1,
  publicationDate: -1,
});
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
