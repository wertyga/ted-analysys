import mongoose, { Document, Model, Schema } from 'mongoose';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { filterModel } from '@/utils';

export interface Contractor {
  _id?: string;
  name?: string;
  identifiers?: string[];
  countries?: string[];
  countrySubs?: string[];
  cities?: string[];
  postCodes?: string[];
  size?: string;
  listed?: string;
  internetAddresses?: string[];
  emails?: string[];
  ownerNationalities?: string[];
  euRegistrationNumber?: string;
  cpvCodes: string[];

  stats: {
    lastAwardWinDate: Date | null;
    totalAwardAmountEur: number;
    awardTendersCount: number;
    awardLotsCount: number;
  };

  createdAt?: Date;
  updatedAt?: Date;
}

const CONTRACTOR_LIST_FIELDS = [
  'name',
  'identifiers',
  'countries',
  'countrySubs',
  'cities',
  'postCodes',
  'emails',
  'cpvCodes',
  'createdAt',
] satisfies Array<keyof Contractor>;

export type ContractorAwardSummary = {
  // awardTendersCount?: number;
  // totalAwardedValueEur?: number;
};

export type ContractorDocument = Contractor & Document;
export type ContractorRecord = Contractor & { _id: unknown };
export type ContractorSerializable = ContractorDocument | ContractorRecord;
export type ContractorListDto = Pick<
  Contractor,
  '_id' | (typeof CONTRACTOR_LIST_FIELDS)[number]
> &
  ContractorAwardSummary;
export type ContractorDetailDto = Contractor & {
  awardTenders: ReturnType<typeof AwardTenderModel.serializeList>[];
} & ContractorAwardSummary;

export interface ContractorModelType extends Model<ContractorDocument> {
  serializeList(contractor: ContractorSerializable): ContractorListDto;
  serializeDetail(contractor: ContractorSerializable): ContractorDetailDto;
}

const ContractorStatsSchema = new Schema<Contractor['stats']>(
  {
    lastAwardWinDate: { type: Date },
    totalAwardAmountEur: { type: Number },
    awardTendersCount: { type: Number },
    awardLotsCount: { type: Number },
  },
  { _id: false },
);

export const ContractorSchema = new Schema<
  ContractorDocument,
  ContractorModelType
>(
  {
    name: { type: String, trim: true },
    identifiers: { type: [String], trim: true },

    countries: { type: [String], default: [] },

    countrySubs: { type: [String], default: [] },

    cities: { type: [String], default: [] },

    postCodes: { type: [String], default: [] },

    size: { type: String, trim: true },
    listed: { type: String, trim: true },

    internetAddresses: { type: [String], default: [] },

    emails: { type: [String], trim: true, lowercase: true },

    ownerNationalities: { type: [String], default: [] },

    euRegistrationNumber: { type: String, trim: true },

    cpvCodes: { type: [String], default: [] },

    stats: {
      type: ContractorStatsSchema,
    },
  },
  {
    collection: 'contractors',
    timestamps: true,
  },
);

ContractorSchema.index({ identifiers: 1 });
ContractorSchema.index({ emails: 1 });
ContractorSchema.index({ name: 1 });
ContractorSchema.index({ euRegistrationNumber: 1 });

ContractorSchema.statics.serializeList = function (
  contractor: ContractorSerializable,
): ContractorListDto {
  return filterModel(contractor, {
    includeFields: CONTRACTOR_LIST_FIELDS,
  }) as ContractorListDto;
};

ContractorSchema.statics.serializeDetail = function (
  contractor: ContractorSerializable,
): ContractorDetailDto {
  return filterModel(contractor) as ContractorDetailDto;
};

export const ContractorModel: ContractorModelType =
  (mongoose.models.Contractor as ContractorModelType | undefined) ??
  mongoose.model<ContractorDocument, ContractorModelType>(
    'Contractor',
    ContractorSchema,
  );
