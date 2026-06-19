import mongoose, { Document, Model, Schema } from 'mongoose';

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
  contactPoint?: string;
  person?: string;
  email?: string;
  phone?: string;
  fax?: string;
  url?: string;
  gateway?: string;
};

export type BuyerAddress = {
  street?: string;
  postCode?: string;
  city?: string;
  country?: string;
  countrySub?: string;
};

export type BuyerStats = {
  tenderCount: number;
  totalEstimatedValueEur: number;
  firstPublicationDate?: Date;
  lastPublicationDate?: Date;
  cpvCodes: string[];
  countries: string[];
};

export type Buyer = {
  _id: string;

  name: string;

  contact?: BuyerContact;
  address?: BuyerAddress;

  identifiers: BuyerIdentifier[];

  legalTypes: string[];
  mainActivities: string[];

  profiles: string[];
  websites: string[];
  emails: string[];
  phones: string[];
  gateways: string[];

  isCentralPurchasingBody: boolean;
  isAwardingCentralPurchasingBody: boolean;
  isGroupLead: boolean;

  stats: BuyerStats;

  createdAt: Date;
  updatedAt: Date;
};

export type BuyerDocument = Document<Buyer>;

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
    contactPoint: String,
    person: String,
    email: String,
    phone: String,
    fax: String,
    url: String,
    gateway: String,
  },
  { _id: false },
);

const BuyerAddressSchema = new Schema<BuyerAddress>(
  {
    street: String,
    postCode: String,
    city: { type: String, index: true },
    country: { type: String, index: true },
    countrySub: { type: String, index: true },
  },
  { _id: false },
);

const BuyerStatsSchema = new Schema<BuyerStats>(
  {
    tenderCount: { type: Number, default: 0 },
    totalEstimatedValueEur: { type: Number, default: 0 },
    firstPublicationDate: Date,
    lastPublicationDate: Date,
    cpvCodes: { type: [String], default: [] },
    countries: { type: [String], default: [] },
  },
  { _id: false },
);

export const BuyerSchema = new Schema<Buyer>(
  {
    name: { type: String, required: true, index: true },

    identifiers: {
      type: [BuyerIdentifierSchema],
      default: [],
    },

    contact: BuyerContactSchema,
    address: BuyerAddressSchema,

    legalTypes: { type: [String], default: [], index: true },
    mainActivities: { type: [String], default: [], index: true },

    profiles: { type: [String], default: [] },
    websites: { type: [String], default: [] },
    emails: { type: [String], default: [] },
    phones: { type: [String], default: [] },
    gateways: { type: [String], default: [] },

    isCentralPurchasingBody: { type: Boolean, default: false },
    isAwardingCentralPurchasingBody: { type: Boolean, default: false },
    isGroupLead: { type: Boolean, default: false },

    stats: {
      type: BuyerStatsSchema,
      default: () => ({
        tenderCount: 0,
        totalEstimatedValueEur: 0,
        cpvCodes: [],
        countries: [],
      }),
    },
  },
  { timestamps: true },
);

export const BuyerModel: Model<Buyer> =
  mongoose.models.Buyer ?? mongoose.model<Buyer>('Buyer', BuyerSchema);
