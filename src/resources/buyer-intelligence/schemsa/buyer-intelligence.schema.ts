import mongoose, { Document, Model, Schema } from 'mongoose';

export type BuyerIntelligence = {
  summary: string;
  procurementBehavior: string;
  supplierRelationship: string;
  strengths: string[];
  risks: string[];
  recommendations: string[];
};

export type BuyerIntelligenceDocument = BuyerIntelligence & Document;

export const BuyerIntelligenceSchema = new Schema<BuyerIntelligenceDocument>(
  {
    summary: { type: String, default: '' },
    procurementBehavior: { type: String, default: '' },
    supplierRelationship: { type: String, default: '' },
    strengths: { type: [String], default: [] },
    risks: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'buyer_intelligence' },
);

export const BuyerIntelligenceModel: Model<BuyerIntelligenceDocument> =
  (mongoose.models.BuyerIntelligence as
    | Model<BuyerIntelligenceDocument>
    | undefined) ??
  mongoose.model<BuyerIntelligenceDocument>(
    'BuyerIntelligence',
    BuyerIntelligenceSchema,
  );
