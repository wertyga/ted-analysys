import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import { DateRange } from '@/resources/analytics/google.types';
import { formatDate, shiftDays } from '@/utils';
import { MarketingDataService } from '../marketing-data.service';
import {
  MarketingTaskDto,
  MarketingTaskModel,
  MarketingTaskRecord,
} from '../schemas/marketing-task.schema';
import {
  MarketingTaskHistoryActor,
  MarketingTaskHistoryEntry,
  MarketingTaskHistoryType,
  MarketingTaskMetricsLookup,
  MarketingTaskSource,
  MarketingTaskStatus,
} from '../marketing-task.types';
import {
  buildMarketingTaskFingerprint,
  pushMarketingTaskHistory,
} from '../marketing-task.utils';
import {
  buildMarketingTaskSystemPrompt,
  buildMarketingTaskUserPrompt,
  MARKETING_TASK_LLM_ITEM_SCHEMA,
  MARKETING_TASK_LLM_RESPONSE_SCHEMA,
  MARKETING_TASK_LLM_REVIEW_SCHEMA,
  MarketingTaskLlmItem,
  MarketingTaskLlmReview,
  MarketingTaskPromptTrackedTask,
  toPromptHistoryEntry,
} from './marketing-task.prompt';

/** Rejected tasks stay in the "do not suggest again" list for this long. */
const REJECTED_TASK_MEMORY_DAYS = 90;

/** Done tasks keep being tracked (metrics + AI review) for this long. */
const DONE_TASK_TRACKING_DAYS = 60;

/** History entries of a tracked task passed to the LLM. */
const PROMPT_HISTORY_ENTRIES = 12;

const OPEN_STATUSES = [
  MarketingTaskStatus.new,
  MarketingTaskStatus.in_progress,
];

type TrackedTask = MarketingTaskRecord & { _id: Types.ObjectId };

export interface GenerateMarketingTasksOptions {
  /** Length of the analyzed period in days (compared with the previous one). */
  days?: number;
  maxTasks?: number;
  language?: string;
}

export interface GenerateMarketingTasksResult {
  periodStart: string;
  periodEnd: string;
  /** The model's overall read of the period (what moved and why). */
  diagnosis?: string;
  created: MarketingTaskDto[];
  /** Tracked tasks that got an AI review note in this run. */
  reviewed: number;
  /** Tasks the model returned that were invalid or duplicated existing ones. */
  skipped: number;
  /** Data sources that failed; the run still uses whatever was collected. */
  dataErrors: string[];
}

@Injectable()
export class MarketingTaskGenerator {
  private readonly logger = new Logger(MarketingTaskGenerator.name);

  constructor(
    private readonly marketingDataService: MarketingDataService,
    private readonly llmAnalysisService: LlmAnalysisService,
  ) {}

  async generate({
    days = 28,
    maxTasks = 10,
    language = 'ru',
  }: GenerateMarketingTasksOptions = {}): Promise<GenerateMarketingTasksResult> {
    const { snapshot, metricsFor } =
      await this.marketingDataService.collectSnapshot(days);

    if (!snapshot.searchConsole && !snapshot.analytics) {
      throw new ServiceUnavailableException(
        `No marketing data collected. ${snapshot.errors.join('; ') || 'Set GSC_SITE_URL and/or GA4_PROPERTY_ID.'}`,
      );
    }

    const now = new Date();
    const [trackedTasks, rejectedTasks] = await Promise.all([
      MarketingTaskModel.find({
        $or: [
          { status: { $in: OPEN_STATUSES } },
          {
            status: MarketingTaskStatus.done,
            completedAt: { $gte: shiftDays(now, -DONE_TASK_TRACKING_DAYS) },
          },
        ],
      })
        .lean<TrackedTask[]>()
        .exec(),
      MarketingTaskModel.find({
        status: MarketingTaskStatus.rejected,
        updatedAt: { $gte: shiftDays(now, -REJECTED_TASK_MEMORY_DAYS) },
      })
        .select('title category pageUrl query template fingerprint')
        .lean()
        .exec(),
    ]);

    const response = await this.llmAnalysisService.createDeepJsonResponse(
      buildMarketingTaskSystemPrompt({ maxTasks, language }),
      buildMarketingTaskUserPrompt({
        snapshot,
        trackedTasks: trackedTasks.map((task) =>
          this.toPromptTrackedTask(task, metricsFor),
        ),
        rejectedTasks: rejectedTasks.map((task) => ({
          title: task.title,
          category: task.category,
          pageUrl: task.pageUrl,
          query: task.query,
          template: task.template,
        })),
      }),
    );

    const parsedResponse =
      MARKETING_TASK_LLM_RESPONSE_SCHEMA.safeParse(response);

    if (!parsedResponse.success) {
      throw new ServiceUnavailableException(
        `LLM returned an invalid marketing task response: ${parsedResponse.error.message}`,
      );
    }

    const reviewed = await this.recordTrackedTasks({
      trackedTasks,
      rawReviews: parsedResponse.data.reviews,
      metricsFor,
      period: snapshot.period,
      now,
    });

    // Done tasks are left out: a follow-up for work without effect is allowed.
    const knownFingerprints = new Set(
      [
        ...trackedTasks.filter((task) => OPEN_STATUSES.includes(task.status)),
        ...rejectedTasks,
      ].map((task) => task.fingerprint),
    );
    const tasksToCreate: (MarketingTaskLlmItem & { fingerprint: string })[] =
      [];
    let skipped = 0;

    for (const rawTask of parsedResponse.data.tasks.slice(0, maxTasks)) {
      const parsedTask = MARKETING_TASK_LLM_ITEM_SCHEMA.safeParse(rawTask);

      if (!parsedTask.success) {
        skipped += 1;
        this.logger.warn(
          `Skipping invalid marketing task from LLM: ${parsedTask.error.message}`,
        );
        continue;
      }

      const fingerprint = buildMarketingTaskFingerprint(parsedTask.data);

      if (knownFingerprints.has(fingerprint)) {
        skipped += 1;
        continue;
      }

      knownFingerprints.add(fingerprint);
      tasksToCreate.push({ ...parsedTask.data, fingerprint });
    }

    const created = tasksToCreate.length
      ? await MarketingTaskModel.insertMany(
          tasksToCreate.map((task) => ({
            title: task.title.trim().slice(0, 200),
            description: task.description.trim().slice(0, 3000),
            category: task.category,
            priority: task.priority,
            pageUrl: task.pageUrl || undefined,
            query: task.query?.slice(0, 300) || undefined,
            scope: task.scope,
            template: task.template || undefined,
            evidence: task.evidence.trim().slice(0, 2000),
            deliverable: task.deliverable.trim().slice(0, 4000),
            acceptanceCriteria: task.acceptanceCriteria.trim().slice(0, 1000),
            estimatedClicks:
              task.estimatedClicks != null
                ? Math.round(task.estimatedClicks)
                : undefined,
            expectedImpact:
              task.expectedImpact?.trim().slice(0, 500) || undefined,
            fingerprint: task.fingerprint,
            source: MarketingTaskSource.ai,
            status: MarketingTaskStatus.new,
            periodStart: snapshot.period.startDate,
            periodEnd: snapshot.period.endDate,
            llmProvider: this.llmAnalysisService.getDeepAnalysisProvider(),
            llmModel: this.llmAnalysisService.getDeepAnalysisModel(),
            history: [
              {
                at: now,
                actor: MarketingTaskHistoryActor.ai,
                type: MarketingTaskHistoryType.created,
                metrics: metricsFor(task),
                periodStart: snapshot.period.startDate,
                periodEnd: snapshot.period.endDate,
              },
            ],
          })),
        )
      : [];

    this.logger.log(
      `Marketing analysis ${snapshot.period.startDate}..${snapshot.period.endDate}: created ${created.length}, reviewed ${reviewed}, skipped ${skipped}`,
    );

    return {
      periodStart: snapshot.period.startDate,
      periodEnd: snapshot.period.endDate,
      diagnosis: parsedResponse.data.diagnosis?.trim() || undefined,
      created: created.map(
        (task) => MarketingTaskModel.serialize(task) as MarketingTaskDto,
      ),
      reviewed,
      skipped,
      dataErrors: snapshot.errors,
    };
  }

  private toPromptTrackedTask(
    task: TrackedTask,
    metricsFor: MarketingTaskMetricsLookup,
  ): MarketingTaskPromptTrackedTask {
    const history = task.history ?? [];

    return {
      id: task._id.toString(),
      title: task.title,
      description: task.description,
      category: task.category,
      scope: task.scope,
      template: task.template,
      pageUrl: task.pageUrl,
      query: task.query,
      deliverable: task.deliverable,
      status: task.status,
      createdAt: task.createdAt && formatDate(new Date(task.createdAt)),
      completedAt: task.completedAt && formatDate(new Date(task.completedAt)),
      notes: task.notes,
      summary: task.summary,
      baselineMetrics: history.find((entry) => entry.metrics)?.metrics,
      currentMetrics: metricsFor(task),
      recentHistory: history
        .slice(-PROMPT_HISTORY_ENTRIES)
        .map(toPromptHistoryEntry),
    };
  }

  /**
   * Appends this run to the history of every tracked task: the AI note when
   * the model reviewed the task, otherwise just the current metrics.
   * Returns the number of reviewed tasks.
   */
  private async recordTrackedTasks({
    trackedTasks,
    rawReviews,
    metricsFor,
    period,
    now,
  }: {
    trackedTasks: TrackedTask[];
    rawReviews: unknown[];
    metricsFor: MarketingTaskMetricsLookup;
    period: DateRange;
    now: Date;
  }): Promise<number> {
    const reviewsById = new Map<string, MarketingTaskLlmReview>();

    for (const rawReview of rawReviews) {
      const parsedReview =
        MARKETING_TASK_LLM_REVIEW_SCHEMA.safeParse(rawReview);

      if (!parsedReview.success) {
        this.logger.warn(
          `Skipping invalid marketing task review from LLM: ${parsedReview.error.message}`,
        );
        continue;
      }

      reviewsById.set(parsedReview.data.taskId, parsedReview.data);
    }

    let reviewed = 0;
    const operations = trackedTasks.flatMap((task) => {
      const review = reviewsById.get(task._id.toString());
      const metrics = metricsFor(task);
      const periodRecorded = task.history?.some(
        (entry) =>
          entry.periodStart === period.startDate &&
          entry.periodEnd === period.endDate,
      );

      // Without a note, only metrics of a period not recorded yet are new.
      if (!review && (!metrics || periodRecorded)) return [];

      if (review) reviewed += 1;

      const entry: MarketingTaskHistoryEntry = {
        at: now,
        actor: review
          ? MarketingTaskHistoryActor.ai
          : MarketingTaskHistoryActor.system,
        type: review
          ? MarketingTaskHistoryType.ai_review
          : MarketingTaskHistoryType.metrics,
        text: review?.note.trim().slice(0, 2000),
        metrics,
        periodStart: period.startDate,
        periodEnd: period.endDate,
      };
      const summary = review?.summary?.trim().slice(0, 1000);

      return [
        {
          updateOne: {
            filter: { _id: task._id },
            update: {
              ...pushMarketingTaskHistory([entry]),
              ...(summary && { $set: { summary } }),
            },
            // updatedAt stays tied to admin edits (used for rejected-task memory).
            timestamps: false,
          },
        },
      ];
    });

    if (operations.length) {
      await MarketingTaskModel.bulkWrite(operations);
    }

    return reviewed;
  }
}
