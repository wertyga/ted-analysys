import mongoose, { Document, Model, Schema } from 'mongoose';

export interface Contractor {
  _id?: string;
  name?: string;
  identifier?: string;
  countries?: string[];
  countrySubs?: string[];
  cities?: string[];
  postCodes?: string[];
  size?: string;
  listed?: string;
  internetAddresses?: string[];
  email?: string;
  cpvCodes?: string[];
  awardTenders?: unknown[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type ContractorDocument = Contractor & Document;

export const ContractorSchemaDefinition = {
  name: { type: String, trim: true },
  identifier: { type: String, trim: true },

  countries: { type: [String], default: [] },

  countrySubs: { type: [String], default: [] },

  cities: { type: [String], default: [] },

  postCodes: { type: [String], default: [] },

  size: { type: String, trim: true },
  listed: { type: String, trim: true },

  internetAddresses: { type: [String], default: [] },

  email: { type: String, trim: true, lowercase: true },

  cpvCodes: { type: [String], default: [] },

  awardTenders: {
    type: [Schema.Types.ObjectId],
    ref: 'AwardTender',
    default: [],
  },
};

export const ContractorSchema = new Schema<ContractorDocument>(
  ContractorSchemaDefinition,
  {
    collection: 'contractors',
    timestamps: true,
  },
);

ContractorSchema.index(
  { identifier: 1 },
  {
    unique: true,
    partialFilterExpression: { identifier: { $type: 'string' } },
  },
);
ContractorSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string' } },
  },
);
ContractorSchema.index({ name: 1 });

export const ContractorModel: Model<ContractorDocument> =
  (mongoose.models.Contractor as Model<ContractorDocument> | undefined) ??
  mongoose.model<ContractorDocument>('Contractor', ContractorSchema);
