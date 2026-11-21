import mongoose, { Document, Model, Schema } from 'mongoose';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import {
  MoneyValue,
  TenderCriteriaSchema,
  TenderDocumentsLinks,
  TenderLot,
} from '@/resources/tenders/schemas';
import { filterModel, isPopulatedRecord } from '@/utils';
import {
  ContractorDocument,
  ContractorModel,
} from '@/resources/contractor/schemas';
import {
  BuyerDocument,
  BuyerModel,
  BuyerSerializable,
} from '@/resources/buyer/schemas';
import { TMongoId } from '@/types';
import type {
  AwardValueCorrection,
  TenderValueRange,
} from '../utils/award-value-sanity';

export type AwardTenderLot = TenderLot & {
  awardValue?: {
    amount: MoneyValue;
    currency: string | null;
  };
  awardValueEur?: MoneyValue;
  tenderValueRange?: TenderValueRange | null;
  winner?: string | ContractorDocument;
};

export interface AwardTender {
  _id: string;
  id: string;
  noticeType?: string;
  noticeSubtype?: string;
  noticeVersion?: string;
  /** TED procedure-identifier (BT-04): links the result to its contract notice. */
  procedureId?: string;
  procedureType?: string;
  title?: string;
  titleProc?: string;
  description?: string;

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
  // Fixes applied to the published award values, see award-value-sanity.ts
  awardValueCorrections: AwardValueCorrection[];

  awardDecisionDates: string[];
  // Latest plausible awardDecisionDates entry, see utils/award-date.ts
  awardDate: Date | null;
  selectionStatuses: string[];
  placeOfPerformanceCountriesProc: string[];
  placeOfPerformanceCitiesProc: string[];
  placeOfPerformanceCountries: string[];
  placeOfPerformanceCities: string[];
  placeOfPerformanceSubdivisions: string[];

  contractConclusionDates: Date[];

  lots: AwardTenderLot[];

  selectionCriteriaSources: string[];

  winners: Array<mongoose.Types.ObjectId | ContractorDocument | string>;
  links: TenderDocumentsLinks;
  createdAt?: Date;
  updatedAt?: Date;

  nonLeadBuyers: (TMongoId | BuyerDocument)[];
  leadBuyers: (TMongoId | BuyerDocument)[];
}

export type AwardTenderDocument = AwardTender & Document;
export type AwardTenderRecord = AwardTender & { _id: unknown };
export type AwardTenderSerializable = AwardTenderDocument | AwardTenderRecord;

export type AwardTenderDetailDto = Omit<AwardTender, 'links'>;

export type AwardTenderListDto = Omit<
  Pick<
    AwardTender,
    | 'contractConclusionDates'
    | '_id'
    | 'id'
    | 'title'
    | 'titleProc'
    | 'publicationDate'
    | 'procedureType'
    | 'contractNature'
    | 'cpvCodes'
    | 'awardValue'
    | 'awardValueEur'
    | 'awardDecisionDates'
    | 'awardDate'
  >,
  never
> & {
  leadBuyers: AwardTenderListBuyer[];
  nonLeadBuyers: AwardTenderListBuyer[];
  winners: AwardTenderListWinner[];
  lots: AwardTenderListLot[];
};

const awardTenderListFields = [
  'id',
  'title',
  'titleProc',
  'publicationDate',
  'procedureType',
  'contractNature',
  'cpvCodes',
  'awardValue',
  'awardValueEur',
  'awardDecisionDates',
  'awardDate',
  'contractConclusionDates',
  'leadBuyers',
  'nonLeadBuyers',
  'winners',
  'lots',
] satisfies Array<Extract<keyof AwardTenderListDto, string>>;

type AwardTenderListBuyer = Pick<BuyerDocument, '_id' | 'name'> & {
  id?: string;
};

type AwardTenderListWinner = Pick<
  ContractorDocument,
  | '_id'
  | 'name'
  | 'identifiers'
  | 'cities'
  | 'countries'
  | 'euRegistrationNumber'
>;

type AwardTenderListLot = Pick<
  AwardTenderLot,
  | 'identifier'
  | 'title'
  | 'description'
  | 'contractNature'
  | 'mainClassification'
  | 'additionalClassifications'
  | 'awardValue'
  | 'awardValueEur'
  | 'estimatedValue'
  | 'estimatedValueEur'
  | 'placeOfPerformanceCountry'
  | 'placeOfPerformanceSubdivision'
  | 'placeOfPerformanceCity'
  | 'awardCriteria'
  | 'selectionCriteria'
  | 'duration'
  | 'plannedEndDate'
  | 'isFrameworkAgreement'
  | 'isDps'
  | 'isSME'
  | 'documentUrls'
  | 'submissionUrls'
  | 'winner'
>;

const awardTenderListBuyerFields = ['id', 'name'] satisfies Array<
  Extract<keyof AwardTenderListBuyer, string>
>;

const awardTenderListWinnerFields = [
  'name',
  'identifiers',
  'cities',
  'countries',
  'euRegistrationNumber',
] satisfies Array<Extract<keyof AwardTenderListWinner, string>>;

const awardTenderListLotFields = [
  'identifier',
  'title',
  'description',
  'contractNature',
  'mainClassification',
  'additionalClassifications',
  'awardValue',
  'awardValueEur',
  'estimatedValue',
  'estimatedValueEur',
  'placeOfPerformanceCountry',
  'placeOfPerformanceSubdivision',
  'placeOfPerformanceCity',
  'awardCriteria',
  'selectionCriteria',
  'duration',
  'plannedEndDate',
  'isFrameworkAgreement',
  'isDps',
  'isSME',
  'documentUrls',
  'submissionUrls',
  'winner',
] satisfies Array<Extract<keyof AwardTenderListLot, string>>;

export interface AwardTenderModelType extends Model<AwardTenderDocument> {
  serializeList(tender: AwardTenderSerializable): AwardTenderListDto;
  serializeDetail(tender: AwardTenderSerializable): AwardTenderDetailDto;
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
    title: String,
    description: String,
    mainClassification: { type: [String], default: [] },
    additionalClassifications: { type: [String], default: [] },
    contractNature: String,

    estimatedValue: { type: AwardTenderLotValueSchema },
    awardValue: { type: AwardTenderLotValueSchema },
    estimatedValueEur: { type: Number, default: null, index: true },
    awardValueEur: { type: Number, default: null, index: true },
    tenderValueRange: {
      type: new Schema(
        {
          lower: { type: Number, default: null },
          higher: { type: Number, default: null },
          currency: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    isFrameworkAgreement: Boolean,
    isDps: Boolean,
    isSME: Boolean,

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
    awardCriteria: { type: [TenderCriteriaSchema], default: [] },
    selectionCriteria: { type: Schema.Types.Mixed },
    selectionCriteriaSource: String,

    winner: {
      type: Schema.Types.ObjectId,
      ref: 'Contractor',
    },
  },
  { _id: false, strict: false },
);

const AwardTenderSchema = new Schema<AwardTenderDocument, AwardTenderModelType>(
  {
    id: { type: String, required: true, unique: true },
    noticeType: { type: String },
    noticeSubtype: String,
    noticeVersion: String,
    procedureId: String,
    procedureType: String,
    title: String,
    titleProc: String,
    description: String,
    selectionStatuses: { type: [String], default: [] },

    publicationDate: { type: Date },
    dispatchDate: Date,
    awardDecisionDates: { type: [Date], default: [] },
    awardDate: { type: Date, default: null },
    contractConclusionDates: { type: [Date], default: [] },

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
    awardValueCorrections: { type: Schema.Types.Mixed, default: () => [] },

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
    nonLeadBuyers: {
      type: [Schema.Types.ObjectId],
      ref: 'Buyer',
      default: [],
    },
    leadBuyers: {
      type: [Schema.Types.ObjectId],
      ref: 'Buyer',
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
  contractNature: 1,
  publicationDate: -1,
});
AwardTenderSchema.index({ winners: 1, publicationDate: -1 });
// Result of the procedure on the tender page (filled for new notices only).
AwardTenderSchema.index({ procedureId: 1 }, { sparse: true });
AwardTenderSchema.index({ 'lots.winner': 1 });
AwardTenderSchema.index({ 'winners.identifier': 1 });
AwardTenderSchema.index({ 'winners.name': 1 });
AwardTenderSchema.index({ awardDate: -1, _id: -1 });
AwardTenderSchema.index({ awardValueEur: -1, _id: -1 });
AwardTenderSchema.index({ leadBuyers: 1, publicationDate: -1 });
AwardTenderSchema.index({ nonLeadBuyers: 1, publicationDate: -1 });

function serializeAwardTenderRelations<T extends Partial<AwardTender>>(
  tender: T,
): T {
  return {
    ...tender,
    nonLeadBuyers:
      tender.nonLeadBuyers?.map((b) =>
        BuyerModel.serializeList(b as BuyerSerializable),
      ) ?? [],
    leadBuyers:
      tender.leadBuyers?.map((b) =>
        BuyerModel.serializeList(b as BuyerSerializable),
      ) ?? [],
    winners: Array.isArray(tender.winners)
      ? tender.winners.map((winner) =>
          isPopulatedRecord(winner)
            ? filterModel(winner as ContractorDocument)
            : winner,
        )
      : tender.winners,
  };
}

function serializeAwardTenderListBuyer(
  buyer?: TMongoId | BuyerDocument,
): AwardTenderListBuyer | undefined {
  return filterModel(buyer, {
    includeFields: awardTenderListBuyerFields as any,
  }) as AwardTenderListBuyer;
}

function serializeAwardTenderListWinner(
  winner?: TMongoId | ContractorDocument,
): AwardTenderListWinner | undefined {
  return filterModel(winner, {
    includeFields: awardTenderListWinnerFields as any,
  }) as AwardTenderListWinner;
}

function serializeAwardTenderListLot(lot: AwardTenderLot): AwardTenderListLot {
  const serializedLot = filterModel(lot, {
    includeFields: awardTenderListLotFields,
  }) as AwardTenderListLot;

  return {
    ...serializedLot,
    winner: serializeAwardTenderListWinner(
      serializedLot.winner,
    ) as AwardTenderLot['winner'],
  };
}

AwardTenderSchema.statics.serializeList = function (
  tender: AwardTenderSerializable,
): AwardTenderListDto {
  const { winners, lots, ...serializedAwardTender } = filterModel(tender, {
    includeFields: awardTenderListFields,
  });

  return {
    ...serializedAwardTender,
    lots: lots.map(serializeAwardTenderListLot),
    nonLeadBuyers:
      serializedAwardTender.nonLeadBuyers?.map(serializeAwardTenderListBuyer) ??
      [],
    leadBuyers:
      serializedAwardTender.leadBuyers?.map(serializeAwardTenderListBuyer) ??
      [],
    winners: winners
      .map(serializeAwardTenderListWinner)
      .filter((winner): winner is AwardTenderListWinner => Boolean(winner)),
  };
};

AwardTenderSchema.statics.serializeDetail = function (
  tender: AwardTenderSerializable,
): AwardTenderDetailDto {
  return serializeAwardTenderRelations(
    filterModel(tender, {
      excludeFields: ['links'],
    }),
  ) as AwardTenderDetailDto;
};

export const AwardTenderModel: AwardTenderModelType =
  (mongoose.models.AwardTender as AwardTenderModelType | undefined) ??
  mongoose.model<AwardTenderDocument, AwardTenderModelType>(
    'AwardTender',
    AwardTenderSchema,
  );
