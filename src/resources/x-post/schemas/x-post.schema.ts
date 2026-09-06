import mongoose, { Document, Model, Schema } from 'mongoose';
import { filterModel } from '@/utils';

export enum XPostPillar {
  InterestingTender = 'interesting_tender',
  MarketInsight = 'market_insight',
  ContractAward = 'contract_award',
  ProcurementInsight = 'procurement_insight',
  /**
   * A real, historical business/procurement story (e.g. a famous cost
   * overrun, a landmark contract, a procurement scandal) — evergreen like
   * Procurement Insight, but narrative rather than tactical, and unlike
   * every other pillar it has no Tenderwize DB signal to ground it in (the
   * events predate or fall outside TED data). Grounding instead comes
   * entirely from web-enrichment-verified external facts — see
   * historical-story-topics.ts and X_POSTS_GUIDELINES.md. This pillar
   * requires BRAVE_API_KEY; without it there is nothing to ground the story
   * in, and generation refuses rather than letting the model narrate from
   * unverified memory.
   */
  HistoricalStory = 'historical_story',
}

/**
 * A "story angle" is a second-level format choice within a pillar (e.g.
 * Contract Award told as a supplier's award history, rather than a single
 * fresh award announcement). Only Contract Award supports a non-Auto angle
 * today (CompanyStory); other pillars ignore this field. Auto means "let the
 * backend pick the best available angle, falling back to the pillar's
 * generic flow if none qualifies".
 */
export enum XPostStoryAngle {
  Auto = 'auto',
  CompanyStory = 'company_story',
}

export enum XPostFormat {
  Single = 'single',
  Thread = 'thread',
}

export enum XPostStatus {
  Draft = 'draft',
  Approved = 'approved',
  Published = 'published',
}

export enum XPostSource {
  Ai = 'ai',
  Manual = 'manual',
}

/**
 * A source-verified fact found on the open web that corroborates a Company
 * Story pattern (see WebEnrichmentService). Stored so an admin can check
 * every claim against its real source before publishing — no web fact is
 * ever folded into a post without one.
 */
export interface XPostExternalFact {
  fact: string;
  sourceUrl: string;
  sourceTitle: string;
  publishedAt?: string;
  retrievedAt: Date;
}

export interface XPost {
  topic: string;
  pillar?: XPostPillar;
  /** Second-level format within the pillar, e.g. company_story for Contract Award. */
  storyAngle?: XPostStoryAngle;
  format: XPostFormat;
  posts: string[];
  hashtags: string[];
  status: XPostStatus;
  source: XPostSource;
  notes?: string;
  llmProvider?: string;
  llmModel?: string;
  imageUrl?: string;
  imageGeneratedAt?: Date;
  /** Ids of the real tender/award records the AI generator grounded this post in. */
  sourceIds: string[];
  /** Human-readable summary of the source record(s), for admin verification. */
  sourceSummary?: string;
  /**
   * The real-world entity (e.g. supplier/contractor id) this post's story
   * angle was built around, used to enforce a cooldown/novelty check so the
   * same company story isn't retold without a meaningful new development.
   */
  sourceEntityId?: string;
  /**
   * Snapshot of the facts used to build the story (award count, known total
   * value, largest/latest award, buyers, countries), so a future generation
   * can tell whether anything meaningfully changed since this post.
   */
  storyFacts?: Record<string, unknown>;
  /** External sources found during web enrichment that corroborate this Company Story, if any (see WebEnrichmentService). Empty when enrichment is disabled or found nothing usable. */
  externalFacts?: XPostExternalFact[];
  createdBy?: mongoose.Types.ObjectId;
  publishedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type XPostDocument = XPost & Document;
export type XPostRecord = XPost & { _id?: unknown };
export type XPostDto = XPostRecord;

export interface XPostModelType extends Model<XPostDocument> {
  serialize(xPost?: XPostDocument | XPostRecord | null): XPostDto | null;
}

const XPostExternalFactSchema = new Schema<XPostExternalFact>(
  {
    fact: { type: String, required: true, trim: true, maxlength: 500 },
    sourceUrl: { type: String, required: true, trim: true },
    sourceTitle: { type: String, trim: true, maxlength: 300 },
    publishedAt: { type: String, default: undefined },
    retrievedAt: { type: Date, required: true },
  },
  { _id: false },
);

const XPostSchema = new Schema<XPostDocument, XPostModelType>(
  {
    topic: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    pillar: {
      type: String,
      enum: Object.values(XPostPillar),
      default: undefined,
      index: true,
    },
    storyAngle: {
      type: String,
      enum: Object.values(XPostStoryAngle),
      default: undefined,
    },
    format: {
      type: String,
      enum: Object.values(XPostFormat),
      required: true,
      default: XPostFormat.Single,
    },
    posts: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) =>
          Array.isArray(value) && value.length > 0,
        message: 'posts must contain at least one post',
      },
    },
    hashtags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(XPostStatus),
      required: true,
      default: XPostStatus.Draft,
      index: true,
    },
    source: {
      type: String,
      enum: Object.values(XPostSource),
      required: true,
      default: XPostSource.Ai,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: undefined,
    },
    llmProvider: {
      type: String,
      default: undefined,
    },
    llmModel: {
      type: String,
      default: undefined,
    },
    imageUrl: {
      type: String,
      default: undefined,
    },
    imageGeneratedAt: {
      type: Date,
      default: undefined,
    },
    sourceIds: {
      type: [String],
      default: [],
    },
    sourceSummary: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: undefined,
    },
    sourceEntityId: {
      type: String,
      default: undefined,
      index: true,
    },
    storyFacts: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    externalFacts: {
      type: [XPostExternalFactSchema],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
    publishedAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    collection: 'x_posts',
    timestamps: true,
  },
);

XPostSchema.index({ createdAt: -1 });
XPostSchema.index({ status: 1, createdAt: -1 });
XPostSchema.index({ pillar: 1, storyAngle: 1, sourceEntityId: 1, createdAt: -1 });

XPostSchema.statics.serialize = function (xPost) {
  if (!xPost) {
    return null;
  }

  return filterModel(xPost) as XPostDto;
};

export const XPostModel: XPostModelType =
  (mongoose.models.XPost as XPostModelType | undefined) ??
  mongoose.model<XPostDocument, XPostModelType>('XPost', XPostSchema);
