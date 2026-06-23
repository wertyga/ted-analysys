import mongoose, { Document, Model, Schema } from 'mongoose';
import { TenderDocument } from '@/resources/tenders/schemas';

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
  url: string;
  gateway: string;
};

export type BuyerAddress = {
  street: string;
  postCode: string;
  city: string;
  country: string;
  countrySub: string;
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

  tenders: TenderDocument[];

  totalEstimatedValueEur: number;
  firstPublicationDate: Date;
  lastPublicationDate: Date;

  organisationIdentifierBuyer: string;
  buyerCountry: string;

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
    contactPoint: { type: String, default: '' },
    person: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    fax: { type: String, default: '' },
    url: { type: String, default: '' },
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

export const BuyerSchema = new Schema<Buyer>(
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
    buyerCountry: {
      type: String,
      index: true,
    },

    legalTypes: { type: [String], default: [], index: true },
    mainActivities: { type: [String], default: [], index: true },

    profiles: { type: [String], default: [] },
    websites: { type: [String], default: [] },

    totalEstimatedValueEur: { type: Number, default: 0 },
    firstPublicationDate: Date,
    lastPublicationDate: Date,
    cpvCodes: { type: [String], default: [] },
    countries: { type: [String], default: [] },
    gateways: { type: [String], default: [] },
  },
  { timestamps: true },
);

BuyerSchema.index({ buyerCountry: 1, organisationIdentifierBuyer: 1 });

export const BuyerModel: Model<Buyer> =
  mongoose.models.Buyer ?? mongoose.model<Buyer>('Buyer', BuyerSchema);
