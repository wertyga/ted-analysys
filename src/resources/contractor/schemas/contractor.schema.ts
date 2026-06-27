import mongoose, { Document, Model, Schema } from 'mongoose';
import {
  AwardTenderDocument,
  AwardTenderModel,
} from '@/resources/award-tender/schemas';
import { filterModel } from '@/utils';

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
export type ContractorRecord = Contractor & { _id: unknown };
export type ContractorSerializable = ContractorDocument | ContractorRecord;
export type ContractorListDto = Omit<Contractor, 'awardTenders'>;
export type ContractorDetailDto = Omit<Contractor, 'awardTenders'> & {
  awardTenders: ReturnType<typeof AwardTenderModel.serializeList>[];
};

export interface ContractorModelType extends Model<ContractorDocument> {
  serializeList(contractor: ContractorSerializable): ContractorListDto;
  serializeDetail(contractor: ContractorSerializable): ContractorDetailDto;
}

export const ContractorSchema = new Schema<
  ContractorDocument,
  ContractorModelType
>(
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

ContractorSchema.statics.serializeList = function (
  contractor: ContractorSerializable,
): ContractorListDto {
  return filterModel(contractor, {
    excludeFields: ['awardTenders'],
  }) as ContractorListDto;
};

ContractorSchema.statics.serializeDetail = function (
  contractor: ContractorSerializable,
): ContractorDetailDto {
  const { awardTenders, ...serializedContractor } = filterModel(contractor);

  return {
    ...serializedContractor,
    awardTenders: awardTenders.map(AwardTenderModel.serializeList),
  } as ContractorDetailDto;
};

export const ContractorModel: ContractorModelType =
  (mongoose.models.Contractor as ContractorModelType | undefined) ??
  mongoose.model<ContractorDocument, ContractorModelType>(
    'Contractor',
    ContractorSchema,
  );
