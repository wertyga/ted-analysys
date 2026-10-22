import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import { formatDate } from '@/utils';
import { MarketingDataService } from '../marketing-data.service';
import { inspectMarketingPage } from '../marketing-page-inspector';
import { MarketingTaskModel } from '../schemas/marketing-task.schema';
import {
  MarketingTaskHistoryActor,
  MarketingTaskHistoryEntry,
  MarketingTaskHistoryType,
} from '../marketing-task.types';
import {
  classifyPage,
  pushMarketingTaskHistory,
} from '../marketing-task.utils';
import { toPromptHistoryEntry } from './marketing-task.prompt';
import {
  buildMarketingTaskCheckSystemPrompt,
  buildMarketingTaskCheckUserPrompt,
  MARKETING_TASK_CHECK_LLM_SCHEMA,
} from './marketing-task-check.prompt';

/** History entries of the task passed to the LLM. */
const CHECK_HISTORY_ENTRIES = 20;

/**
 * A template task has no pageUrl; the page it was found on is quoted in its
 * text. Without a live sample the LLM only sees the old facts in "evidence"
 * and reports them as the current state of the page.
 */
const findSamplePageUrl = (task: {
  template?: string | null;
  evidence?: string | null;
  deliverable?: string | null;
  acceptanceCriteria?: string | null;
  description?: string | null;
}): string | undefined => {
  const urls = [
    task.evidence,
    task.deliverable,
    task.acceptanceCriteria,
    task.description,
  ]
    .flatMap((text) => text?.match(/https?:\/\/[^\s"'`<>()«»]+/g) ?? [])
    .map((url) => url.replace(/[.,;:!?]+$/, ''));

  return (
    urls.find(
      (url) =>
        task.template &&
        String(classifyPage(url).template) === task.template,
    ) ?? urls[0]
  );
};

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

  async check(id: string, { days = 14, language }: CheckMarketingTaskOptions) {
    const task = await MarketingTaskModel.findById(id).lean().exec();

    if (!task) {
      throw new NotFoundException(`Marketing task ${id} not found`);
    }

    const pageUrl =
      this.marketingDataService.resolvePageUrl(task.pageUrl) ??
      findSamplePageUrl(task);
    const [metrics, livePage] = await Promise.all([
      this.marketingDataService.collectTaskMetrics(
        { pageUrl: pageUrl ?? task.pageUrl, query: task.query },
        days,
      ),
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
