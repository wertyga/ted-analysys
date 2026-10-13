import mongoose, { Document, Model, Schema } from 'mongoose';

export enum CompanyProfileWebsiteExtractionStatus {
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
}

/**
 * One website profile extraction run. Doubles as the usage counter:
 * a `free` run is the single extraction allowed without a Pro tariff.
 */
export interface CompanyProfileWebsiteExtraction {
  user: mongoose.Types.ObjectId;
  url: string;
  free: boolean;
  status: CompanyProfileWebsiteExtractionStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CompanyProfileWebsiteExtractionDocument =
  CompanyProfileWebsiteExtraction & Document;

export type CompanyProfileWebsiteExtractionModelType =
  Model<CompanyProfileWebsiteExtractionDocument>;

const CompanyProfileWebsiteExtractionSchema = new Schema<
  CompanyProfileWebsiteExtractionDocument,
  CompanyProfileWebsiteExtractionModelType
>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    url: { type: String, required: true },
    free: { type: Boolean, required: true },
    status: {
      type: String,
      enum: Object.values(CompanyProfileWebsiteExtractionStatus),
      default: CompanyProfileWebsiteExtractionStatus.PROCESSING,
    },
  },
  {
    collection: 'company_profile_website_extractions',
    timestamps: true,
  },
);

// At most one free run per user, enforced atomically: parallel requests
// cannot both take the free extraction.
CompanyProfileWebsiteExtractionSchema.index(
  { user: 1 },
  {
    name: 'user_free_run_unique',
    unique: true,
    partialFilterExpression: { free: true },
  },
);

export const CompanyProfileWebsiteExtractionModel: CompanyProfileWebsiteExtractionModelType =
  (mongoose.models.CompanyProfileWebsiteExtraction as
    | CompanyProfileWebsiteExtractionModelType
    | undefined) ??
  mongoose.model<
    CompanyProfileWebsiteExtractionDocument,
    CompanyProfileWebsiteExtractionModelType
  >('CompanyProfileWebsiteExtraction', CompanyProfileWebsiteExtractionSchema);
