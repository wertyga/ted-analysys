import mongoose, { Document, Model, Schema } from 'mongoose';
import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import { filterModel } from '@/utils';
import {
  AwardTenderDocument,
  AwardTenderModel,
} from '@/resources/award-tender/schemas';

export enum BuyerIdentifierType {
  TED_ORG_ID = 'TED_ORG_ID',
  NATIONAL_ID = 'NATIONAL_ID',
  VAT = 'VAT',
  ORG_NAME = 'ORG_NAME',
  UNKNOWN = 'UNKNOWN',
}

export type BuyerIdentifier = {
  type: BuyerIdentifierType;
  value: string;
};

export type BuyerContact = {
  contactPoint: string;
  person: string;
  email: string;
  phone: string;
  fax: string;
  website: string;
  gateway: string;
};

export type BuyerAddress = {
  street: string;
  postCode: string;
  city: string;
  country: string;
  countrySub: string;
};

export type BuyerCodeName = {
  code: string;
  name: string;
};

export type BuyerTopCpvCodeStats = {
  code: string;
  count: number;
};

export type BuyerTopCountryStats = {
  country: string;
  count: number;
};

export type BuyerTopSupplierStats = {
  winner: mongoose.Types.ObjectId;
  wins: number;
};

export type BuyerStats = {
  tendersCount: number;
  awardTendersCount: number;

  totalEstimatedValueEur: number;
  totalAwardedValueEur: number;
  avgEstimatedValueEur: number;
  avgAwardedValueEur: number;

  lastAwardDate?: Date;
  firstPublicationDate?: Date;
  lastPublicationDate?: Date;

  topCpvCodes: BuyerTopCpvCodeStats[];
  topCountries: BuyerTopCountryStats[];
  topSuppliers: BuyerTopSupplierStats[];
};

export enum BuyerIntelligenceSignal {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  UNKNOWN = 'unknown',
}

export type BuyerStatsIntelligence = {
  repeatSupplierRate: number | null;
  localSupplierRate: number | null;
  incumbentRisk: BuyerIntelligenceSignal;
  localSupplierSignal: BuyerIntelligenceSignal;
};

export type Buyer = {
  _id: string;

  /**
   * organisation-name-buyer
   * buyer-name
   */
  name: string;

  /**
   * organisation-contact-point-buyer
   * buyer-contact-point
   * touchpoint-contact-point-buyer
   *
   * organisation-person-buyer
   * buyer-person
   *
   * organisation-email-buyer
   * buyer-email
   * touchpoint-email-buyer
   *
   * organisation-tel-buyer
   * touchpoint-tel-buyer
   *
   * organisation-fax-buyer
   * touchpoint-fax-buyer
   *
   * organisation-internet-address-buyer
   * buyer-internet-address
   * touchpoint-internet-address-buyer
   *
   * organisation-gateway-buyer
   * buyer-gateway
   * touchpoint-gateway-buyer
   */
  contact: BuyerContact;

  /**
   * organisation-street-buyer
   * organisation-post-code-buyer
   * organisation-city-buyer
   * organisation-country-buyer
   * organisation-country-sub-buyer
   *
   * fallback:
   * buyer-city
   * buyer-country
   * buyer-country-sub
   * buyer-post-code
   */
  address: BuyerAddress;

  /**
   * organisation-identifier-buyer
   * buyer-identifier
   */
  identifiers: BuyerIdentifier[];

  /**
   * buyer-legal-type
   * BT-11-Procedure-Buyer
   */
  legalTypes: BuyerCodeName[];

  /**
   * main-activity
   * authority-main-activity
   * entity-main-activity
   * activity-sector
   * BT-10-Procedure-Buyer
   */
  mainActivities: BuyerCodeName[];

  /**
   * buyer-profile
   * BT-508-Procedure-Buyer
   */
  profiles: string[];

  gateways: string[];

  /**
   * organisation-internet-address-buyer
   * buyer-internet-address
   * touchpoint-internet-address-buyer
   */
  websites: string[];

  /**
   * calculated from imported tenders
   *
   * tenderCount:
   *   count of tenders for this buyer
   *
   * totalEstimatedValueEur:
   *   estimated-value-proc
   *   estimated-value-lot
   *   converted to EUR
   *
   * firstPublicationDate:
   *   publication-date (min)
   *
   * lastPublicationDate:
   *   publication-date (max)
   *
   * cpvCodes:
   *   classification-cpv
   *   main-classification-proc
   *   main-classification-lot
   */
  cpvCodes: string[];

  /** countries:
   *   place-of-performance-country-proc
   *   place-of-performance-country-lot
   *   */
  countries: string[];

  organisationIdentifierBuyer: string;

  createdAt: Date;
  updatedAt: Date;

  stats: BuyerStats;
  statsVersion: number;
  intelligence: BuyerStatsIntelligence;
};

export type BuyerDocument = Document & Buyer;
export type BuyerSerializable = BuyerDocument | (Buyer & { _id: unknown });

export type BuyerListDto = Pick<
  Buyer,
  | '_id'
  | 'name'
  | 'contact'
  | 'address'
  | 'identifiers'
  | 'legalTypes'
  | 'mainActivities'
  | 'profiles'
  | 'websites'
  | 'cpvCodes'
  | 'countries'
  | 'organisationIdentifierBuyer'
  | 'createdAt'
  | 'updatedAt'
  | 'stats'
  | 'statsVersion'
  | 'intelligence'
>;

export type BuyerDetailDto = Buyer & {};

export interface BuyerModelType extends Model<BuyerDocument> {
  serializeList(buyer: BuyerSerializable): BuyerListDto;
  serializeDetail(buyer: BuyerSerializable): BuyerDetailDto;
}

const BuyerIdentifierSchema = new Schema<BuyerIdentifier>(
  {
    type: {
      type: String,
      enum: BuyerIdentifierType,
      required: true,
      index: true,
    },
    value: { type: String, required: true },
  },
  { _id: false },
);

const BuyerContactSchema = new Schema<BuyerContact>(
  {
    contactPoint: { type: String, default: '' },
    person: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    fax: { type: String, default: '' },
    website: { type: String, default: '' },
    gateway: { type: String, default: '' },
  },
  { _id: false },
);

const BuyerAddressSchema = new Schema<BuyerAddress>(
  {
    street: { type: String, default: '' },
    postCode: { type: String, default: '' },
    city: { type: String, default: '', index: true },
    country: { type: String, default: '', index: true },
    countrySub: { type: String, default: '', index: true },
  },
  { _id: false },
);

const BuyerCodeNameSchema = new Schema<BuyerCodeName>(
  {
    code: { type: String, required: true, index: true },
    name: { type: String, required: true },
  },
  { _id: false },
);

const BuyerTopCpvCodeStatsSchema = new Schema<BuyerTopCpvCodeStats>(
  {
    code: { type: String, required: true },
    count: { type: Number, required: true },
  },
  { _id: false },
);

const BuyerTopCountryStatsSchema = new Schema<BuyerTopCountryStats>(
  {
    country: { type: String, required: true },
    count: { type: Number, required: true },
  },
  { _id: false },
);

const BuyerTopSupplierStatsSchema = new Schema<BuyerTopSupplierStats>(
  {
    winner: {
      type: Schema.Types.ObjectId,
      ref: 'Contractor',
      required: true,
    },
    wins: { type: Number, required: true },
  },
  { _id: false },
);

const BuyerStatsSchema = new Schema<BuyerStats>(
  {
    tendersCount: { type: Number, default: 0 },
    avgAwardedValueEur: { type: Number, default: 0 },
    avgEstimatedValueEur: { type: Number, default: 0 },
    awardTendersCount: { type: Number, default: 0 },
    totalAwardedValueEur: { type: Number, default: 0 },
    totalEstimatedValueEur: { type: Number, default: 0 },
    lastAwardDate: { type: Date },
    firstPublicationDate: { type: Date },
    lastPublicationDate: { type: Date },
    topCpvCodes: { type: [BuyerTopCpvCodeStatsSchema], default: [] },
    topCountries: { type: [BuyerTopCountryStatsSchema], default: [] },
    topSuppliers: { type: [BuyerTopSupplierStatsSchema], default: [] },
  },
  { _id: false },
);

const BuyerStatsIntelligenceSchema = new Schema<BuyerStatsIntelligence>(
  {
    repeatSupplierRate: { type: Number, default: null },
    localSupplierRate: { type: Number, default: null },
    incumbentRisk: {
      type: String,
      enum: BuyerIntelligenceSignal,
      default: BuyerIntelligenceSignal.UNKNOWN,
    },
    localSupplierSignal: {
      type: String,
      enum: BuyerIntelligenceSignal,
      default: BuyerIntelligenceSignal.UNKNOWN,
    },
  },
  { _id: false },
);

export const BuyerSchema = new Schema<BuyerDocument, BuyerModelType>(
  {
    name: { type: String, required: true, index: true },

    identifiers: {
      type: [BuyerIdentifierSchema],
      default: [],
    },

    contact: BuyerContactSchema,
    address: BuyerAddressSchema,

    organisationIdentifierBuyer: {
      type: String,
      index: true,
    },

    legalTypes: { type: [BuyerCodeNameSchema], default: [] },
    mainActivities: { type: [BuyerCodeNameSchema], default: [] },

    profiles: { type: [String], default: [] },
    websites: { type: [String], default: [] },

    cpvCodes: { type: [String], default: [] },
    countries: { type: [String], default: [] },
    gateways: { type: [String], default: [] },

    stats: {
      type: BuyerStatsSchema,
    },
    statsVersion: { type: Number, default: 1 },
    intelligence: {
      type: BuyerStatsIntelligenceSchema,
    },
  },
  { timestamps: true },
);

BuyerSchema.index({ 'address.country': 1, organisationIdentifierBuyer: 1 });

BuyerSchema.statics.serializeList = function (
  buyer: BuyerSerializable,
): BuyerListDto {
  return filterModel(buyer, {
    includeFields: [
      'name',
      'contact',
      'address',
      'identifiers',
      'legalTypes',
      'mainActivities',
      'profiles',
      'websites',
      'stats',
      'cpvCodes',
      'countries',
      'organisationIdentifierBuyer',
      'createdAt',
      'updatedAt',
      'statsVersion',
      'intelligence',
    ],
  });
};

BuyerSchema.statics.serializeDetail = function (
  buyer: BuyerSerializable,
): BuyerDetailDto {
  return filterModel(buyer);
};

export const BuyerModel: BuyerModelType =
  (mongoose.models.Buyer as BuyerModelType | undefined) ??
  mongoose.model<BuyerDocument, BuyerModelType>('Buyer', BuyerSchema);
