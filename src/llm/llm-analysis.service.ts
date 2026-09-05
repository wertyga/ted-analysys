import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { BaseLlmAnalysisService } from './base-llm-analysis.service';
import { isRecord } from '@/utils';

export interface TenderShortTitleInput {
  id: string;
  title: string;
}

export interface TenderShortTitleResult {
  id: string;
  shortTitle: {
    en: string;
    de: string;
    fr: string;
    pl: string;
    ru: string;
  };
}

export interface GenerateXPostInput {
  /** When omitted, the model picks the subject itself — see buildTopicGuidance. */
  topic?: string;
  pillar?: string;
  format: 'single' | 'thread';
  tone?: string;
  notes?: string;
  guidelines: string;
  /** One-line summaries of recently generated posts for this pillar, to avoid repeats. */
  recentlyCovered?: string[];
}

export interface GenerateXPostResult {
  posts: string[];
  hashtags: string[];
  notes: string;
}

export interface GenerateXPostWithDataResult extends GenerateXPostResult {
  /** ids of the tool-result records the model claims to have based the post on */
  usedSourceIds: string[];
  /** names of every tool actually invoked during generation */
  calledTools: string[];
}

type LlmProvider = 'deepseek' | 'openai' | 'kimi' | 'aigate';
type LlmAnalysisPurpose = 'general' | 'deep';

interface LlmProviderConnection {
  client: OpenAI;
  model: string;
  provider: LlmProvider;
  providerName: string;
}

@Injectable()
export class LlmAnalysisService extends BaseLlmAnalysisService {
  private readonly generalConnection: LlmProviderConnection;
  private readonly deepConnection: LlmProviderConnection;

  constructor(private readonly configService: ConfigService) {
    super('LLM', new Logger(LlmAnalysisService.name));

    const provider = this.resolveProvider();

    this.generalConnection = this.createConnection(
      'general',
      provider,
      'GENERAL_ANALYSIS_MODEL',
    );
    this.deepConnection = this.createConnection(
      'deep',
      provider,
      'DEEP_ANALYSIS_MODEL',
    );
  }

  private resolveProvider(): LlmProvider {
    const provider =
      this.getFirstConfigValue('LLM_PROVIDER')?.toLowerCase() ?? 'deepseek';

    if (
      provider === 'deepseek' ||
      provider === 'openai' ||
      provider === 'kimi' ||
      provider === 'aigate'
    ) {
      return provider;
    }

    throw new ServiceUnavailableException(
      `Unsupported LLM provider "${provider}". Use "deepseek", "openai", "kimi", or "aigate".`,
    );
  }

  getProvider(): LlmProvider {
    return this.getGeneralAnalysisProvider();
  }

  getGeneralAnalysisProvider(): LlmProvider {
    return this.generalConnection.provider;
  }

  getDeepAnalysisProvider(): LlmProvider {
    return this.deepConnection.provider;
  }

  getGeneralAnalysisModel(): string {
    return this.generalConnection.model;
  }

  getDeepAnalysisModel(): string {
    return this.deepConnection.model;
  }

  async generateTenderShortTitles(
    input: TenderShortTitleInput[],
  ): Promise<TenderShortTitleResult[]> {
    const response =
      await this.generalConnection.client.chat.completions.create({
        model: this.generalConnection.model,
        messages: [
          {
            role: 'system',
            content: [
              'You rewrite public procurement tender titles into short, clear, user-facing titles.',
              'For each input item, preserve the id exactly.',
              'Create shortTitle translations in English, German, French, Polish, and Russian.',
              'Keep each title concise, ideally 5-10 words.',
              'Preserve the procurement subject and avoid adding facts not present in the source title.',
              'Return JSON only in this exact shape: {"items":[{"id":"...","en":"...","de":"...","fr":"...","pl":"...","ru":"..."}]}.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({ items: input }, null, 2),
          },
        ],
        ...this.getChatCompletionOptions(this.generalConnection),
        stream: false,
      });
    const responseText = response.choices[0]?.message.content;

    if (!responseText) {
      throw new Error(
        `${this.generalConnection.providerName} response did not contain message content`,
      );
    }

    const parsed = JSON.parse(responseText) as unknown;

    return this.validateTenderShortTitles(parsed);
  }

  async generateXPost(input: GenerateXPostInput): Promise<GenerateXPostResult> {
    const formatInstruction =
      input.format === 'thread'
        ? 'Write a thread: an array of 3-7 posts. The first post is the hook and must also work as a standalone post. Each subsequent post covers exactly one point, following the thread structure rules.'
        : 'Write a single standalone post, under 280 characters, following the single-post structure rules. You may return up to 3 alternative variants of the same idea in the posts array.';

    const response =
      await this.generalConnection.client.chat.completions.create({
        model: this.generalConnection.model,
        messages: [
          {
            role: 'system',
            content: [
              'You write posts for X (formerly Twitter) for TED, a SaaS platform that helps companies find, analyze, and win public procurement tenders.',
              'Follow these house style guidelines exactly:',
              input.guidelines,
              formatInstruction,
              this.buildTopicGuidance(input),
              'Return JSON only in this exact shape: {"posts":["..."],"hashtags":["..."],"notes":"..."}.',
              '"posts" is an ordered array of post bodies. "hashtags" contains at most 1 hashtag without the # symbol, or an empty array. "notes" is one short sentence explaining the angle you took (or, if you picked the topic yourself, what you picked and why).',
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                topic: input.topic,
                pillar: input.pillar ?? null,
                tone: input.tone ?? null,
                format: input.format,
                extraNotes: input.notes ?? null,
              },
              null,
              2,
            ),
          },
        ],
        ...this.getChatCompletionOptions(this.generalConnection),
        stream: false,
      });
    const responseText = response.choices[0]?.message.content;

    if (!responseText) {
      throw new Error(
        `${this.generalConnection.providerName} response did not contain message content`,
      );
    }

    const parsed = this.parseModelJson(responseText);

    return this.validateXPostResult(parsed);
  }

  /**
   * Same as generateXPost, but gives the model tools to fetch real data from
   * Tenderwize's database before writing, and requires it to cite which
   * tool-result records it actually used (see XPostService for server-side
   * verification of those ids against what the tools really returned).
   */
  async generateXPostWithData(
    input: GenerateXPostInput,
    tools: ChatCompletionTool[],
    executeTool: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>,
  ): Promise<GenerateXPostWithDataResult> {
    if (tools.length === 0) {
      const base = await this.generateXPost(input);

      return { ...base, usedSourceIds: [], calledTools: [] };
    }

    const formatInstruction =
      input.format === 'thread'
        ? 'Write a thread: an array of 3-7 posts. The first post is the hook and must also work as a standalone post. Each subsequent post covers exactly one point, following the thread structure rules.'
        : 'Write a single standalone post, under 280 characters, following the single-post structure rules. You may return up to 3 alternative variants of the same idea in the posts array.';

    const systemPrompt = [
      'You write posts for X (formerly Twitter) for TED, a SaaS platform that helps companies find, analyze, and win public procurement tenders.',
      'Follow these house style guidelines exactly:',
      input.guidelines,
      formatInstruction,
      this.buildTopicGuidance(input),
      "You have a tool to fetch real data from Tenderwize's database. You MUST call it at least once before writing anything, and every specific fact in the post (buyer, winner, amount, date, count, CPV code) MUST come from a tool result — never invent, estimate, or round a number that is not present in a tool result.",
      'If a tool call returns no matching items (an empty items array), call it again once with broader parameters (drop some filters). If it is still empty after that, do not write a post about invented data — respond with the final JSON answer using an empty "posts" array and explain in "notes" that no matching data was found.',
      'When you do have results, pick ONE record to write about (for a list of items) unless you used a stats tool, in which case write about the returned numbers.',
      'Final answer format: JSON only, no markdown code fences, in this exact shape: {"posts":["..."],"hashtags":["..."],"notes":"...","usedSourceIds":["..."]}.',
      '"usedSourceIds" must contain the "id" field(s) of the tool-result record(s) you actually used — an empty array if you used a stats tool or found no data.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify(
          {
            topic: input.topic,
            pillar: input.pillar ?? null,
            tone: input.tone ?? null,
            format: input.format,
            extraNotes: input.notes ?? null,
          },
          null,
          2,
        ),
      },
    ];

    const calledTools = new Set<string>();
    // A topic-less generation (esp. Market Insight "find an interesting
    // trend") needs a few extra tool-call rounds to explore before writing.
    const maxRounds = input.topic && input.topic.trim() ? 4 : 6;

    for (let round = 0; round < maxRounds; round += 1) {
      const response =
        await this.generalConnection.client.chat.completions.create({
          model: this.generalConnection.model,
          messages,
          tools,
          tool_choice: 'auto',
          stream: false,
          // OpenAI's reasoning models (e.g. gpt-5.x) reject function tools on
          // /v1/chat/completions unless reasoning is explicitly turned off.
          ...(this.generalConnection.provider === 'openai'
            ? { reasoning_effort: 'none' as const }
            : {}),
        });
      const message = response.choices[0]?.message;

      if (!message) {
        throw new Error(
          `${this.generalConnection.providerName} response did not contain a message`,
        );
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push({
          role: 'assistant',
          content: message.content,
          tool_calls: message.tool_calls,
        });

        for (const toolCall of message.tool_calls) {
          const toolName =
            toolCall.type === 'function' ? toolCall.function.name : '';

          calledTools.add(toolName);

          let args: Record<string, unknown> = {};

          if (toolCall.type === 'function') {
            try {
              args = JSON.parse(toolCall.function.arguments || '{}') as Record<
                string,
                unknown
              >;
            } catch {
              args = {};
            }
          }

          let toolResult: unknown;

          try {
            toolResult = await executeTool(toolName, args);
          } catch (error) {
            toolResult = {
              error: error instanceof Error ? error.message : String(error),
            };
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        continue;
      }

      if (calledTools.size === 0 && round < maxRounds - 1) {
        // The model answered without calling the tool at all. Don't accept
        // this as final — nudge it and give it another round. If it still
        // never calls the tool, XPostService's post-hoc verification (no
        // verified source ids) rejects the draft rather than trusting a
        // possibly-invented answer.
        messages.push({ role: 'assistant', content: message.content });
        messages.push({
          role: 'user',
          content:
            'You must call the data tool before writing anything. Call it now with parameters derived from the topic above.',
        });
        continue;
      }

      const content = message.content;

      if (!content) {
        throw new Error(
          `${this.generalConnection.providerName} response did not contain message content`,
        );
      }

      const parsed = this.parseModelJson(content);
      const validated = this.validateXPostResult(parsed);
      const usedSourceIds =
        isRecord(parsed) && Array.isArray(parsed.usedSourceIds)
          ? parsed.usedSourceIds.filter(
              (id): id is string => typeof id === 'string',
            )
          : [];

      return {
        ...validated,
        usedSourceIds,
        calledTools: Array.from(calledTools),
      };
    }

    throw new ServiceUnavailableException(
      `${this.generalConnection.providerName} did not produce a final answer after ${maxRounds} tool-call rounds`,
    );
  }

  /**
   * Builds the "pick the subject yourself" / "avoid repeating past posts"
   * instructions. Returns '' when a topic was given and there's no history
   * to avoid, so callers can filter it out of the prompt.
   */
  private buildTopicGuidance(input: GenerateXPostInput): string {
    const lines: string[] = [];
    const hasTopic = Boolean(input.topic && input.topic.trim());

    if (!hasTopic) {
      if (input.pillar === 'interesting_tender') {
        lines.push(
          'No topic was given. Search broadly for real open tenders (try sorting by newest and by highest value across a couple of calls) and pick whichever one is most compelling for the audience — a big number, a notable buyer, or an unusual subject.',
        );
      } else if (input.pillar === 'market_insight') {
        lines.push(
          'No topic was given. Explore the data yourself: try a few different metrics, countries, or categories with multiple tool calls, and report whichever trend is the most interesting or surprising — not just the first thing you queried.',
        );
      } else if (input.pillar === 'contract_award') {
        lines.push(
          'No topic was given. Search broadly for real recent contract awards and pick whichever one is most notable — a large value, a well-known buyer or winner, or an unusual subject.',
        );
      } else if (input.pillar === 'procurement_insight') {
        lines.push(
          'No topic was given. Pick an educational procurement topic yourself (CPV codes, framework agreements, how to search tenders, award criteria, common bid mistakes, procurement quirks) — one that is not in the "recently covered" list below.',
        );
      } else {
        lines.push(
          'No topic was given. Choose a compelling, on-brand subject yourself.',
        );
      }
    }

    if (input.recentlyCovered && input.recentlyCovered.length > 0) {
      lines.push(
        [
          'Recently covered by this account for this pillar — avoid repeating these, or the same underlying record/stat/story:',
          ...input.recentlyCovered.map(
            (item, index) => `${index + 1}. ${item}`,
          ),
        ].join('\n'),
      );
    }

    return lines.join('\n\n');
  }

  private stripJsonCodeFence(content: string): string {
    const trimmed = content.trim();
    const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);

    return fenceMatch ? fenceMatch[1] : trimmed;
  }

  /**
   * Models occasionally wrap the JSON answer in prose ("Based on my
   * search, here's the post: {...}") even when told to return JSON only.
   * Try increasingly lenient extraction strategies before giving up.
   */
  private parseModelJson(content: string): unknown {
    const candidates = [
      content.trim(),
      this.stripJsonCodeFence(content),
      this.extractJsonObjectSubstring(content),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;

      try {
        return JSON.parse(candidate);
      } catch {
        // try the next strategy
      }
    }

    throw new Error(
      `${this.generalConnection.providerName} response did not contain valid JSON`,
    );
  }

  private extractJsonObjectSubstring(content: string): string | null {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) return null;

    return content.slice(start, end + 1);
  }

  protected async createProviderJsonResponse(
    prompt: string,
    context: string,
    purpose: LlmAnalysisPurpose,
  ): Promise<string> {
    const connection = this.getConnection(purpose);
    const response = await connection.client.chat.completions.create({
      model: connection.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: context },
      ],
      ...this.getChatCompletionOptions(connection),
      stream: false,
    });
    const responseText = response.choices[0]?.message.content;

    if (!responseText) {
      throw new Error(
        `${connection.providerName} response did not contain message content`,
      );
    }

    return responseText;
  }

  private getChatCompletionOptions(connection: LlmProviderConnection) {
    if (connection.provider === 'aigate') {
      return {};
    }

    if (connection.provider === 'openai') {
      // OpenAI's newer models (e.g. gpt-5.x) only support the default
      // temperature (1) and reject any other explicit value.
      return {
        response_format: { type: 'json_object' } as const,
      };
    }

    return {
      response_format: { type: 'json_object' } as const,
      temperature: 0.1,
    };
  }

  private createConnection(
    purpose: LlmAnalysisPurpose,
    provider: LlmProvider,
    modelKey: string,
  ): LlmProviderConnection {
    return {
      client: new OpenAI({
        apiKey: this.getApiKey(),
        baseURL: this.getBaseUrl(provider),
      }),
      model: this.getModelConfig(provider, modelKey),
      provider,
      providerName: this.getProviderName(provider),
    };
  }

  private getConnection(purpose: LlmAnalysisPurpose): LlmProviderConnection {
    return purpose === 'deep' ? this.deepConnection : this.generalConnection;
  }

  private getApiKey(): string {
    const apiKey = this.getFirstConfigValue('LLM_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'LLM API key is not configured. Set LLM_API_KEY.',
      );
    }

    return apiKey;
  }

  private getBaseUrl(provider: LlmProvider): string | undefined {
    const providerPrefix = this.getProviderEnvPrefix(provider);
    const providerBaseUrlFallbacks =
      provider === 'kimi' ? ['MOONSHOT_BASE_URL', 'MOONSHOT_API_BASE_URL'] : [];
    const baseUrl = this.getFirstConfigValue(
      'LLM_BASE_URL',
      `${providerPrefix}_BASE_URL`,
      `${providerPrefix}_API_BASE_URL`,
      ...providerBaseUrlFallbacks,
    );

    if (baseUrl) {
      return baseUrl;
    }

    if (provider === 'deepseek') {
      return 'https://api.deepseek.com';
    }

    if (provider === 'kimi') {
      return 'https://api.moonshot.ai/v1';
    }

    if (provider === 'aigate') {
      return 'https://api.aigate.shop/v1';
    }

    return undefined;
  }

  private getModelConfig(provider: LlmProvider, modelKey: string): string {
    const providerPrefix = this.getProviderEnvPrefix(provider);
    const sharedKey = `LLM_${modelKey}`;
    const providerKey = `${providerPrefix}_${modelKey}`;
    const value = this.getFirstConfigValue(sharedKey, providerKey);

    if (!value) {
      throw new ServiceUnavailableException(
        `${sharedKey} or ${providerKey} is not configured`,
      );
    }

    return value;
  }

  private getProviderName(provider: LlmProvider): string {
    if (provider === 'openai') {
      return 'OpenAI';
    }

    if (provider === 'kimi') {
      return 'Kimi';
    }

    if (provider === 'aigate') {
      return 'AIGate';
    }

    return 'DeepSeek';
  }

  private getProviderEnvPrefix(provider: LlmProvider): string {
    if (provider === 'openai') {
      return 'OPENAI';
    }

    if (provider === 'kimi') {
      return 'KIMI';
    }

    if (provider === 'aigate') {
      return 'AIGATE';
    }

    return 'DEEPSEEK';
  }

  private getFirstConfigValue(...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.configService.get<string>(key)?.trim();

      if (value) {
        return value;
      }
    }

    return undefined;
  }

  private validateTenderShortTitles(value: unknown): TenderShortTitleResult[] {
    if (!isRecord(value) || !Array.isArray(value.items)) {
      throw new Error(
        `${this.providerName} short title response must contain items array`,
      );
    }

    return value.items.map((item) => {
      if (!isRecord(item) || typeof item.id !== 'string') {
        throw new Error(
          `${this.providerName} short title item must contain string id`,
        );
      }

      const shortTitle = {
        en: this.requireShortTitleString(item.en, 'en'),
        de: this.requireShortTitleString(item.de, 'de'),
        fr: this.requireShortTitleString(item.fr, 'fr'),
        pl: this.requireShortTitleString(item.pl, 'pl'),
        ru: this.requireShortTitleString(item.ru, 'ru'),
      };

      return {
        id: item.id,
        shortTitle,
      };
    });
  }

  private validateXPostResult(value: unknown): GenerateXPostResult {
    if (!isRecord(value) || !Array.isArray(value.posts)) {
      throw new Error(
        `${this.generalConnection.providerName} x-post response must contain a posts array`,
      );
    }

    const posts = value.posts.map((post, index) => {
      if (typeof post !== 'string' || post.trim().length === 0) {
        throw new Error(
          `${this.generalConnection.providerName} x-post posts[${index}] must be a non-empty string`,
        );
      }

      return post.trim();
    });

    const hashtagsValue = Array.isArray(value.hashtags) ? value.hashtags : [];
    const hashtags = hashtagsValue
      .filter(
        (tag): tag is string =>
          typeof tag === 'string' && tag.trim().length > 0,
      )
      .map((tag) => tag.trim().replace(/^#/, ''));

    const notes = typeof value.notes === 'string' ? value.notes.trim() : '';

    return { posts, hashtags, notes };
  }

  private requireShortTitleString(value: unknown, language: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(
        `${this.providerName} short title ${language} must be a non-empty string`,
      );
    }

    return value.trim();
  }
}
