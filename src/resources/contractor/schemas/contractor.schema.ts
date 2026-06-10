import mongoose, { Document, Model, Schema } from 'mongoose';

export interface Contractor {
  _id?: string;
  name?: string;
  identifier?: string;
  country?: string;
  countrySub?: string;
  city?: string;
  postCode?: string;
  size?: string;
  listed?: string;
  internetAddress?: string;
  email?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ContractorDocument = Contractor & Document;

export const ContractorSchemaDefinition = {
  name: { type: String, trim: true },
  identifier: { type: String, trim: true },
  country: { type: String, trim: true, uppercase: true },
  countrySub: { type: String, trim: true },
  city: { type: String, trim: true },
  postCode: { type: String, trim: true },
  size: { type: String, trim: true },
  listed: { type: String, trim: true },
  internetAddress: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
};

export const ContractorSchema = new Schema<ContractorDocument>(
  ContractorSchemaDefinition,
  {
    collection: 'contractors',
    timestamps: true,
  },
);

ContractorSchema.index({ identifier: 1 });
ContractorSchema.index({ name: 1 });
ContractorSchema.index({ country: 1 });

export const ContractorModel: Model<ContractorDocument> =
  (mongoose.models.Contractor as Model<ContractorDocument> | undefined) ??
  mongoose.model<ContractorDocument>('Contractor', ContractorSchema);
