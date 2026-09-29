import mongoose, { Document, Model, Schema } from 'mongoose';

export type AwardValueReviewStatus =
  // Model suggests changes, waiting for Apply / Reject
  | 'pending'
  | 'applied'
  | 'rejected'
  // Model found nothing wrong
  | 'no_change'
  // Values changed after the review, the suggestion can't be trusted
  | 'stale'
  | 'failed';

export type AwardValueReviewVerdict =
  | 'plausible'
  // Real price found on the web
  | 'replaced'
  | 'shifted'
  | 'invalid';

export type AwardValueReviewMoney = {
  amount: number | null;
  currency: string | null;
  eur: number | null;
};

// A price found on the web, its quote is checked to be on the page
export type AwardPriceFinding = {
  url: string;
  pageTitle: string;
  quote: string;
  amount: number;
  currency: string;
  vat: 'excluded' | 'included' | 'unknown';
  // The awarded contract, one lot, or the tender budget
  scope: 'contract' | 'lot' | 'estimate';
};

export type AwardPriceSearchError = {
  stage: 'search' | 'fetch' | 'llm';
  message: string;
  // Query or url the error is about
  target: string;
};

export type AwardPriceSearchResult = {
  queries: string[];
  pagesFetched: number;
  findings: AwardPriceFinding[];
  errors: AwardPriceSearchError[];
};

export type AwardValueReviewChange = {
  scope: 'tender' | 'lot';
  lotIndex?: number;
  lotTitle?: string;
  verdict: Exclude<AwardValueReviewVerdict, 'plausible'>;
  // Divisor for 'shifted', null otherwise
  factor: number | null;
  reason: string;
  // Where the 'replaced' value comes from
  source?: AwardPriceFinding;
  before: AwardValueReviewMoney;
  after: AwardValueReviewMoney;
};

export interface AwardValueReview {
  awardTender: mongoose.Types.ObjectId | string;
  // TED publication number
  tenderId: string;
  title: string;
  buyerName: string;
  status: AwardValueReviewStatus;
  confidence: 'high' | 'medium' | 'low' | null;
  reason: string;
  changes: AwardValueReviewChange[];
  // Null when web search is not configured
  webSearch?: AwardPriceSearchResult | null;
  llmProvider: string | null;
  llmModel: string | null;
  errorMessage: string | null;
  appliedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AwardValueReviewDocument = AwardValueReview & Document;

const AwardValueReviewSchema = new Schema<AwardValueReviewDocument>(
  {
    awardTender: {
      type: Schema.Types.ObjectId,
      ref: 'AwardTender',
      required: true,
    },
    tenderId: { type: String, required: true },
    title: { type: String, default: '' },
    buyerName: { type: String, default: '' },
    status: { type: String, required: true },
    confidence: { type: String, default: null },
    reason: { type: String, default: '' },
    changes: { type: Schema.Types.Mixed, default: () => [] },
    webSearch: { type: Schema.Types.Mixed, default: null },
    llmProvider: { type: String, default: null },
    llmModel: { type: String, default: null },
    errorMessage: { type: String, default: null },
    appliedAt: { type: Date, default: null },
  },
  {
    collection: 'award_value_reviews',
    timestamps: true,
  },
);

AwardValueReviewSchema.index({ awardTender: 1 }, { unique: true });
AwardValueReviewSchema.index({ status: 1, updatedAt: -1 });

export const AwardValueReviewModel: Model<AwardValueReviewDocument> =
  (mongoose.models.AwardValueReview as
    | Model<AwardValueReviewDocument>
    | undefined) ??
  mongoose.model<AwardValueReviewDocument>(
    'AwardValueReview',
    AwardValueReviewSchema,
  );
