import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import { formatDate, getSafeErrorMessage, shiftDays } from '@/utils';
import { MarketingDataService } from '../marketing-data.service';
import { inspectMarketingPage } from '../marketing-page-inspector';
import { MarketingTaskModel } from '../schemas/marketing-task.schema';
import {
  MarketingTaskHistoryActor,
  MarketingTaskHistoryEntry,
  MarketingTaskHistoryType,
  MarketingTaskStatus,
} from '../marketing-task.types';
import { pushMarketingTaskHistory } from '../marketing-task.utils';
import { toPromptHistoryEntry } from './marketing-task.prompt';
import {
  buildMarketingTaskCheckSystemPrompt,
  buildMarketingTaskCheckUserPrompt,
  MARKETING_TASK_CHECK_LLM_SCHEMA,
} from './marketing-task-check.prompt';

/** History entries of the task passed to the LLM. */
const CHECK_HISTORY_ENTRIES = 20;

/**
 * Scheduled checks: done tasks are checked for an effect only once search
 * data can show it, and until the effect had time to settle.
 */
const DONE_CHECK_FROM_DAYS = 14;
const DONE_CHECK_UNTIL_DAYS = 56;
/** A task is not re-checked more often than this. */
const RECHECK_INTERVAL_DAYS = 7;
/** Upper bound of checks (LLM calls) per scheduled run. */
const MAX_CHECKS_PER_RUN = 20;

export interface CheckDueMarketingTasksResult {
  checked: number;
  failed: number;
  /** Due tasks left for the next run because of MAX_CHECKS_PER_RUN. */
  postponed: number;
}

export interface CheckMarketingTaskOptions {
  /** Length of the compared periods in days. */
  days?: number;
  language?: string;
}

/**
 * On-demand check of one task: fetches the live page and the metrics of
 * exactly its page/query, asks the LLM whether the work is done and had an
 * effect, and records the answer in the task history.
 */
@Injectable()
export class MarketingTaskChecker {
  private readonly logger = new Logger(MarketingTaskChecker.name);

  constructor(
    private readonly marketingDataService: MarketingDataService,
    private readonly llmAnalysisService: LlmAnalysisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Checks the tasks where a check can tell something new: in-progress tasks
   * (is the work on the site yet?) and tasks done 2-8 weeks ago (did it have
   * an effect?), skipping those checked within the last week. Tasks without a
   * page or query are skipped: there is nothing to inspect for them.
   */
  async checkDue(
    options: CheckMarketingTaskOptions = {},
  ): Promise<CheckDueMarketingTasksResult> {
    const now = new Date();
    const candidates = await MarketingTaskModel.find({
      $and: [
        {
          $or: [
            { status: MarketingTaskStatus.in_progress },
            {
              status: MarketingTaskStatus.done,
              completedAt: {
                $gte: shiftDays(now, -DONE_CHECK_UNTIL_DAYS),
                $lte: shiftDays(now, -DONE_CHECK_FROM_DAYS),
              },
            },
          ],
        },
        {
          $or: [
            { pageUrl: { $exists: true, $ne: '' } },
            { query: { $exists: true, $ne: '' } },
          ],
        },
      ],
    })
      .select('_id history.type history.at')
      .lean()
      .exec();

    const recheckAfter = shiftDays(now, -RECHECK_INTERVAL_DAYS).getTime();
    const lastCheckAt = (task: (typeof candidates)[number]) =>
      Math.max(
        0,
        ...(task.history ?? [])
          .filter((entry) => entry.type === MarketingTaskHistoryType.check)
          .map((entry) => new Date(entry.at).getTime()),
      );
    // Never-checked and longest-unchecked tasks go first.
    const due = candidates
      .map((task) => ({ id: String(task._id), lastCheckAt: lastCheckAt(task) }))
      .filter((task) => task.lastCheckAt < recheckAfter)
      .sort((a, b) => a.lastCheckAt - b.lastCheckAt);
    const batch = due.slice(0, MAX_CHECKS_PER_RUN);
    let checked = 0;
    let failed = 0;

    // Sequential on purpose: each check calls the LLM and Google APIs.
    for (const { id } of batch) {
      try {
        await this.check(id, options);
        checked += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Scheduled check of marketing task ${id} failed: ${getSafeErrorMessage(error)}`,
        );
      }
    }

    this.logger.log(
      `Scheduled marketing task checks: checked ${checked}, failed ${failed}, postponed ${due.length - batch.length}`,
    );

    return { checked, failed, postponed: due.length - batch.length };
  }

  async check(id: string, { days = 14, language }: CheckMarketingTaskOptions) {
    const task = await MarketingTaskModel.findById(id).lean().exec();

    if (!task) {
      throw new NotFoundException(`Marketing task ${id} not found`);
    }

    const pageUrl = this.marketingDataService.resolvePageUrl(task.pageUrl);
    const [metrics, livePage] = await Promise.all([
      this.marketingDataService.collectTaskMetrics(task, days),
      pageUrl ? inspectMarketingPage(pageUrl, task.query) : undefined,
    ]);
    const history = task.history ?? [];
    const baseline = history.find((entry) => entry.metrics);

    const response = await this.llmAnalysisService.createDeepJsonResponse(
      buildMarketingTaskCheckSystemPrompt(
        language || this.configService.get('MARKETING_TASKS_LANGUAGE') || 'ru',
      ),
      buildMarketingTaskCheckUserPrompt({
        today: formatDate(new Date()),
        task: {
          title: task.title,
          description: task.description,
          category: task.category,
          status: task.status,
          scope: task.scope,
          template: task.template,
          pageUrl: task.pageUrl,
          query: task.query,
          evidence: task.evidence,
          deliverable: task.deliverable,
          acceptanceCriteria: task.acceptanceCriteria,
          createdAt: task.createdAt && formatDate(new Date(task.createdAt)),
          completedAt:
            task.completedAt && formatDate(new Date(task.completedAt)),
          notes: task.notes,
          summary: task.summary,
        },
        baselineMetrics: baseline && {
          ...baseline.metrics,
          period:
            baseline.periodStart &&
            `${baseline.periodStart}..${baseline.periodEnd}`,
        },
        metrics,
        livePage,
        history: history
          .slice(-CHECK_HISTORY_ENTRIES)
          .map(toPromptHistoryEntry),
      }),
    );

    const parsed = MARKETING_TASK_CHECK_LLM_SCHEMA.safeParse(response);

    if (!parsed.success) {
      throw new ServiceUnavailableException(
        `LLM returned an invalid task check: ${parsed.error.message}`,
      );
    }

    const entry: MarketingTaskHistoryEntry = {
      at: new Date(),
      actor: MarketingTaskHistoryActor.ai,
      type: MarketingTaskHistoryType.check,
      text: parsed.data.note.trim().slice(0, 2000),
      verdict: parsed.data.verdict,
      effect: parsed.data.effect,
      metrics: metrics.current,
      periodStart: metrics.period.startDate,
      periodEnd: metrics.period.endDate,
    };

    const updated = await MarketingTaskModel.findByIdAndUpdate(
      id,
      {
        ...pushMarketingTaskHistory([entry]),
        $set: { summary: parsed.data.summary.trim().slice(0, 1000) },
      },
      { new: true, timestamps: false },
    ).exec();

    const dataErrors = [
      ...metrics.errors,
      ...(livePage?.error ? [`Live page: ${livePage.error}`] : []),
    ];

    if (dataErrors.length) {
      this.logger.warn(
        `Marketing task ${id} checked with data errors: ${dataErrors.join('; ')}`,
      );
    }

    return { task: MarketingTaskModel.serialize(updated), dataErrors };
  }
}
