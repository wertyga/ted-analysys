import mongoose, { Document, Model, Schema } from 'mongoose';

export interface CpvCategory {
  code: string;
  name: string;
  parentCode?: string;
  level: number;
  source: string;
  sourceVersion: string;
  syncedAt: Date;
}

export type CpvCategoryDocument = CpvCategory & Document;

const CpvCategorySchema = new Schema<CpvCategoryDocument>(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    parentCode: { type: String, index: true },
    level: { type: Number, required: true, index: true },
    source: { type: String, required: true },
    sourceVersion: { type: String, required: true },
    syncedAt: { type: Date, required: true },
  },
  {
    collection: 'cpv_categories',
    timestamps: true,
  },
);

export const CpvCategoryModel: Model<CpvCategoryDocument> =
  mongoose.models.CpvCategory ??
  mongoose.model<CpvCategoryDocument>('CpvCategory', CpvCategorySchema);
