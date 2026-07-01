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
    highlights: string[];
  };

  marketBehavior: {
    overview: string;
    highlights: string[];
  };

  supplierLandscape: {
    overview: string;
    highlights: string[];
  };

  historicalTrends: string[];
  dataLimitations: string[];

  errorMessage?: string;

  sourceHash: string;

  createdAt?: Date;
  updatedAt?: Date;
};

const BUYER_INTELLIGENCE_LIST_FIELDS = [
  'buyer',
  'status',
  'summary',
  'sourceHash',
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
      highlights: { type: [String], default: [] },
    },

    marketBehavior: {
      overview: { type: String, default: '' },
      highlights: { type: [String], default: [] },
    },

    supplierLandscape: {
      overview: { type: String, default: '' },
      highlights: { type: [String], default: [] },
    },

    historicalTrends: { type: [String], default: [] },
    dataLimitations: { type: [String], default: [] },
    errorMessage: { type: String },

    sourceHash: { type: String },
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
    excludeFields: ['sourceHash'],
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
