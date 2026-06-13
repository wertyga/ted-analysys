import mongoose, { Document, Model, Schema } from 'mongoose';

export interface Buyer {
  _id?: string;
  name?: string;
  identifier?: string;
  country?: string;
  city?: string;
  legalType?: string;
  contractingEntity?: string;
  mainActivities?: string[];
  email?: string;
  internetAddress?: string;
  profile?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BuyerDocument = Buyer & Document;

export const BuyerSchemaDefinition = {
  name: { type: String, trim: true },
  identifier: { type: String, trim: true },
  country: { type: String, trim: true, uppercase: true },
  city: { type: String, trim: true },
  legalType: { type: String, trim: true },
  contractingEntity: { type: String, trim: true },
  mainActivities: { type: [String] },
  email: { type: String, trim: true, lowercase: true },
  internetAddress: { type: String, trim: true },
  profile: { type: String, trim: true },
};

export const BuyerSchema = new Schema<BuyerDocument>(BuyerSchemaDefinition, {
  collection: 'buyers',
  timestamps: true,
});

BuyerSchema.index({ identifier: 1 });
BuyerSchema.index({ name: 1 });
BuyerSchema.index({ country: 1 });

export const BuyerModel: Model<BuyerDocument> =
  (mongoose.models.Buyer as Model<BuyerDocument> | undefined) ??
  mongoose.model<BuyerDocument>('Buyer', BuyerSchema);
