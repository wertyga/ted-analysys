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
  contact?: BuyerContact;

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
  address?: BuyerAddress;

  /**
   * organisation-identifier-buyer
   * buyer-identifier
   */
  identifiers: BuyerIdentifier[];

  /**
   * buyer-legal-type
   * BT-11-Procedure-Buyer
   */
  legalTypes: string[];

  /**
   * main-activity
   * authority-main-activity
   * entity-main-activity
   * activity-sector
   * BT-10-Procedure-Buyer
   */
  mainActivities: string[];

  /**
   * buyer-profile
   * BT-508-Procedure-Buyer
   */
  profiles: string[];

  /**
   * organisation-internet-address-buyer
   * buyer-internet-address
   * touchpoint-internet-address-buyer
   */
  websites: string[];

  /**
   * organisation-email-buyer
   * buyer-email
   * touchpoint-email-buyer
   */
  emails: string[];

  /**
   * organisation-tel-buyer
   * touchpoint-tel-buyer
   */
  phones: string[];

  /**
   * organisation-gateway-buyer
   * buyer-gateway
   * touchpoint-gateway-buyer
   */
  gateways: string[];

  /**
   * acquiring-cpb-buyer
   */
  isCentralPurchasingBody: boolean;

  /**
   * awarding-cpb-org
   */
  isAwardingCentralPurchasingBody: boolean;

  /**
   * buyer-group-lead
   */
  isGroupLead: boolean;

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
   *
   * countries:
   *   place-of-performance-country-proc
   *   place-of-performance-country-lot
   */
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
