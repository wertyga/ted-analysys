import mongoose, { Document, Model, Schema } from 'mongoose';
import { AwardTenderDocument } from '@/resources/award-tender/schemas';

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
  ownerNationalities?: string[];
  euRegistrationNumber?: string;
  cpvCodes: string[];
  awardTenders?: AwardTenderDocument[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type ContractorDocument = Contractor & Document;

export const ContractorSchema = new Schema<ContractorDocument>(
  {
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

    ownerNationalities: { type: [String], default: [] },

    euRegistrationNumber: { type: String, trim: true },

    cpvCodes: { type: [String], default: [] },

    awardTenders: {
      type: [Schema.Types.ObjectId],
      ref: 'AwardTender',
      default: [],
    },
  },
  {
    collection: 'contractors',
    timestamps: true,
  },
);

ContractorSchema.index({ identifier: 1 });
ContractorSchema.index({ email: 1 });
ContractorSchema.index({ name: 1 });
ContractorSchema.index({ euRegistrationNumber: 1 });

export const ContractorModel: Model<ContractorDocument> =
  (mongoose.models.Contractor as Model<ContractorDocument> | undefined) ??
  mongoose.model<ContractorDocument>('Contractor', ContractorSchema);
