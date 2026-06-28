import mongoose, { Document, Model, Schema } from 'mongoose';
import {
  BuyerDocument,
  BuyerModel,
  BuyerSerializable,
} from '@/resources/buyer/schemas';
import { TenderGeneralAnalysisStatus } from '@/resources/tender-analysis/schemas';
import { filterModel } from '@/utils';

export type BuyerIntelligence = {
  buyer: string | BuyerDocument;
  status: TenderGeneralAnalysisStatus;

  summary: string;

  procurementProfile: {
    overview: string;
    typicalPurchases: string[];
    activityAssessment: string;
  };

  marketBehavior: {
    contractPatterns: string[];
    procedurePatterns: string[];
    valuePatterns: string[];
  };

  supplierLandscape: {
    overview: string;
    repeatSupplierPattern: string[];
    localSupplierPattern: string[];
    supplierDiversity: string[];
  };

  historicalTrends: string[];
  dataLimitations: string[];

  promptVersion: string;
  llmModel: string;
  errorMessage?: string;

  statsVersion: number;

  createdAt?: Date;
  updatedAt?: Date;
};

const BUYER_INTELLIGENCE_LIST_FIELDS = [
  'buyer',
  'status',
  'summary',
  'statsVersion',
  'updatedAt',
] satisfies Array<keyof BuyerIntelligence>;

export type BuyerIntelligenceDocument = BuyerIntelligence & Document;
export type BuyerIntelligenceRecord = BuyerIntelligence & { _id?: unknown };
export type BuyerIntelligenceSerializable =
  | BuyerIntelligenceDocument
  | BuyerIntelligenceRecord;

export type BuyerIntelligenceListDto = Pick<
  BuyerIntelligenceRecord,
  '_id' | (typeof BUYER_INTELLIGENCE_LIST_FIELDS)[number]
>;

export type BuyerIntelligenceDetailDto = Omit<
  BuyerIntelligenceRecord,
  'promptVersion' | 'llmModel'
>;

export interface BuyerIntelligenceModelType extends Model<BuyerIntelligenceDocument> {
  serializeList(
    intelligence?: BuyerIntelligenceSerializable | null,
  ): BuyerIntelligenceListDto | null;
  serializeDetail(
    intelligence?: BuyerIntelligenceSerializable | null,
  ): BuyerIntelligenceDetailDto | null;
}

export const BuyerIntelligenceSchema = new Schema<
  BuyerIntelligence,
  BuyerIntelligenceModelType
>(
  {
    buyer: {
      type: Schema.Types.ObjectId,
      ref: 'Buyer',
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TenderGeneralAnalysisStatus),
      default: TenderGeneralAnalysisStatus.PENDING,
      index: true,
    },
    summary: { type: String, default: '' },
    procurementProfile: {
      overview: { type: String, default: '' },
      typicalPurchases: { type: [String], default: [] },
      activityAssessment: { type: String, default: '' },
    },

    marketBehavior: {
      contractPatterns: { type: [String], default: [] },
      procedurePatterns: { type: [String], default: [] },
      valuePatterns: { type: [String], default: [] },
    },

    supplierLandscape: {
      overview: { type: String, default: '' },
      repeatSupplierPattern: { type: [String], default: [] },
      localSupplierPattern: { type: [String], default: [] },
      supplierDiversity: { type: [String], default: [] },
    },

    historicalTrends: { type: [String], default: [] },
    dataLimitations: { type: [String], default: [] },
    promptVersion: { type: String, default: '' },
    llmModel: { type: String, default: '' },
    errorMessage: { type: String },

    statsVersion: { type: Number, default: 1 },
  },
  { timestamps: true, collection: 'buyer_intelligence' },
);

BuyerIntelligenceSchema.statics.serializeList = function (
  intelligence?: BuyerIntelligenceSerializable | null,
): BuyerIntelligenceListDto | null {
  if (!intelligence) {
    return null;
  }

  const intel: BuyerIntelligenceDetailDto = filterModel(intelligence, {
    includeFields: BUYER_INTELLIGENCE_LIST_FIELDS,
  });

  return {
    ...intel,
    buyer: BuyerModel.serializeList(
      intel.buyer as BuyerSerializable,
    ) as BuyerDocument,
  };
};

BuyerIntelligenceSchema.statics.serializeDetail = function (
  intelligence?: BuyerIntelligenceSerializable | null,
): BuyerIntelligenceDetailDto | null {
  if (!intelligence) {
    return null;
  }

  const intel: BuyerIntelligenceDetailDto = filterModel(intelligence, {
    excludeFields: ['promptVersion', 'llmModel', 'statsVersion'],
  });

  return {
    ...intel,
    buyer: BuyerModel.serializeDetail(
      intel.buyer as BuyerSerializable,
    ) as BuyerDocument,
  };
};

export const BuyerIntelligenceModel: BuyerIntelligenceModelType =
  (mongoose.models.BuyerIntelligence as
    | BuyerIntelligenceModelType
    | undefined) ??
  mongoose.model<BuyerIntelligenceDocument, BuyerIntelligenceModelType>(
    'BuyerIntelligence',
    BuyerIntelligenceSchema,
  );
