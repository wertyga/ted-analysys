import mongoose, { Document, Model, Schema } from 'mongoose';
import { filterModel } from '@/utils';
import {
  MarketingTaskCategory,
  MarketingTaskCheckEffect,
  MarketingTaskCheckVerdict,
  MarketingTaskHistoryActor,
  MarketingTaskHistoryEntry,
  MarketingTaskHistoryType,
  MarketingTaskSource,
  MarketingTaskStatus,
  Priority,
} from '../marketing-task.types';

/** Oldest history entries are dropped beyond this length. */
export const MARKETING_TASK_HISTORY_LIMIT = 100;

export interface MarketingTask {
  title: string;
  description: string;
  category: MarketingTaskCategory;
  pageUrl?: string;
  /** Search query the task targets, when it comes from Search Console data. */
  query?: string;
  /** The concrete metrics that justify the task, so an admin can verify it. */
  evidence?: string;
  expectedImpact?: string;
  priority: Priority;
  status: MarketingTaskStatus;
  source: MarketingTaskSource;
  /** Normalized key used to avoid creating the same open task twice. */
  fingerprint: string;
  periodStart?: string;
  periodEnd?: string;
  llmProvider?: string;
  llmModel?: string;
  notes?: string;
  /** Running summary of the task's progress, rewritten by the AI on review. */
  summary?: string;
  history?: MarketingTaskHistoryEntry[];
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type MarketingTaskDocument = MarketingTask & Document;
export type MarketingTaskRecord = MarketingTask & { _id?: unknown };
export type MarketingTaskDto = MarketingTaskRecord;

export interface MarketingTaskModelType extends Model<MarketingTaskDocument> {
  serialize(
    task?: MarketingTaskDocument | MarketingTaskRecord | null,
  ): MarketingTaskDto | null;
}

const MarketingTaskMetricsSchema = new Schema(
  {
    clicks: Number,
    impressions: Number,
    ctr: Number,
    position: Number,
    sessions: Number,
    engagementRate: Number,
    keyEvents: Number,
  },
  { _id: false },
);

const MarketingTaskHistoryEntrySchema = new Schema<MarketingTaskHistoryEntry>(
  {
    at: { type: Date, required: true },
    actor: {
      type: String,
      enum: Object.values(MarketingTaskHistoryActor),
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(MarketingTaskHistoryType),
      required: true,
    },
    text: { type: String, trim: true, maxlength: 2000, default: undefined },
    status: {
      type: String,
      enum: Object.values(MarketingTaskStatus),
      default: undefined,
    },
    metrics: { type: MarketingTaskMetricsSchema, default: undefined },
    periodStart: { type: String, default: undefined },
    periodEnd: { type: String, default: undefined },
    verdict: {
      type: String,
      enum: Object.values(MarketingTaskCheckVerdict),
      default: undefined,
    },
    effect: {
      type: String,
      enum: Object.values(MarketingTaskCheckEffect),
      default: undefined,
    },
  },
  { _id: false },
);

const MarketingTaskSchema = new Schema<
  MarketingTaskDocument,
  MarketingTaskModelType
>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    category: {
      type: String,
      enum: Object.values(MarketingTaskCategory),
      required: true,
      index: true,
    },
    pageUrl: {
      type: String,
      trim: true,
      default: undefined,
    },
    query: {
      type: String,
      trim: true,
      maxlength: 300,
      default: undefined,
    },
    evidence: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: undefined,
    },
    expectedImpact: {
      type: String,
      trim: true,
      maxlength: 500,
      default: undefined,
    },
    priority: {
      type: String,
      enum: Object.values(Priority),
      default: Priority.medium,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(MarketingTaskStatus),
      default: MarketingTaskStatus.new,
      index: true,
    },
    source: {
      type: String,
      enum: Object.values(MarketingTaskSource),
      default: MarketingTaskSource.ai,
    },
    fingerprint: {
      type: String,
      required: true,
      index: true,
    },
    periodStart: { type: String, default: undefined },
    periodEnd: { type: String, default: undefined },
    llmProvider: { type: String, default: undefined },
    llmModel: { type: String, default: undefined },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: undefined,
    },
    summary: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: undefined,
    },
    history: {
      type: [MarketingTaskHistoryEntrySchema],
      default: [],
    },
    completedAt: { type: Date, default: undefined },
  },
  {
    collection: 'marketing_tasks',
    timestamps: true,
  },
);

MarketingTaskSchema.index({ status: 1, priority: 1, createdAt: -1 });

MarketingTaskSchema.statics.serialize = function (task) {
  if (!task) {
    return null;
  }

  return filterModel(task) as MarketingTaskDto;
};

export const MarketingTaskModel: MarketingTaskModelType =
  (mongoose.models.MarketingTask as MarketingTaskModelType | undefined) ??
  mongoose.model<MarketingTaskDocument, MarketingTaskModelType>(
    'MarketingTask',
    MarketingTaskSchema,
  );
