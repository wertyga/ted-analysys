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
  /**
   * The fixed list of real Tenderwize capabilities the model may cite as the
   * "Tenderwize capability" step of the value-first formula (guidelines
   * section 3). It must not reference any feature outside this list.
   */
  features?: string;
  /** One-line summaries of recently generated posts for this pillar, to avoid repeats. */
  recentlyCovered?: string[];
  /**
   * The only URL the model may use when no more specific record/page URL is
   * available (guidelines section 9, link priority level 5 - homepage). It
   * must never construct any other URL itself.
   */
  homepageUrl?: string;
  /**
   * Raw contents of the frontend's live route manifest (`ROUTES.md`),
   * fetched fresh from `{clientUrl}/ROUTES.md` for this generation. When
   * present, the model may build a URL itself by combining `clientUrl` with
   * one of the exact path patterns listed here, substituting only real
   * values already returned by a tool call (see buildLinkGuidance). Absent
   * when the fetch failed or CLIENT_URL isn't configured.
   */
  routes?: string;
  /** Origin the `routes` patterns are relative to (`process.env.CLIENT_URL`). */
  clientUrl?: string;
  /**
   * JSON-serialized `CompanyStoryFacts` (see x-post-data.service.ts) when
   * this generation is a Contract Award "Company Story" — a supplier's
   * award history already computed by the backend, not fetched by the
   * model itself. Presence of this field switches generateXPost into
   * facts-grounded narrative mode instead of open topic selection.
   */
  companyStoryFacts?: string;
  /**
   * JSON-serialized `ExternalFact[]` (see web-enrichment.service.ts) — real,
   * source-verified facts found on the open web that corroborate the
   * `companyStoryFacts` pattern (e.g. a press release naming the project a
   * contract funds). Each fact was extracted by a separate, stricter LLM
   * call that could only cite text actually present on an allow-listed
   * page, and its `sourceUrl` was verified server-side to be one of the
   * pages actually fetched. Absent when web enrichment is disabled or found
   * nothing usable — Company Story then runs on companyStoryFacts alone.
   */
  externalFacts?: string;
  /**
   * JSON-serialized tender facts + `detectedStory` (see
   * interesting-tender-detector.ts) when this generation is an Interesting
   * Tender whose selection was backed by a statistically-confirmed pattern
   * (exceptional value vs. category baseline, a long-running DPS/framework,
   * a short deadline, etc.) rather than a plain value_desc pick. Presence of
   * this field switches generateXPost into facts-grounded narrative mode,
   * same as companyStoryFacts. `externalFacts` (above) may also be present
   * here, sourced against the tender's buyer instead of a supplier.
   */
  detectedInterestingTender?: string;
  /**
   * JSON-serialized `DetectedMarketInsight` (see market-insight-detector.ts)
   * when this generation is a Market Insight whose subject was backed by a
   * statistically-confirmed trend (a real percentage swing with a minimum
   * sample size, or genuinely new activity) across a scanned set of
   * countries/CPV categories, rather than the model exploring the stats
   * tool itself and picking whatever it found first. Presence of this
   * field switches generateXPost into facts-grounded narrative mode, same
   * as companyStoryFacts/detectedInterestingTender.
   */
  detectedMarketInsight?: string;
  /**
   * The chosen Historical Story subject (see historical-story-topics.ts)
   * when this generation is a Historical Story. Unlike every other
   * facts-grounded mode, there is no Tenderwize DB payload here — the
   * grounding is entirely `externalFacts` (above), which MUST be non-empty
   * whenever this field is set; the caller (XPostService) never sets this
   * without real verified facts to go with it.
   */
  historicalStoryTopic?: string;
}

export interface GenerateXPostResult {
  posts: string[];
  hashtags: string[];
  notes: string;
}

export interface ExternalFactPage {
  url: string;
  title: string;
  publishedAt: string | null;
  text: string;
}

export interface ExtractExternalFactsInput {
  /** What the facts must be about, e.g. a supplier name (Company Story) or a tender's buyer/subject (Interesting Tender). */
  subjectName: string;
  /** Free-text hint of what the facts should relate to, e.g. an award title + buyer name. */
  context: string;
  pages: ExternalFactPage[];
}

export interface ExtractedExternalFact {
  fact: string;
  sourceUrl: string;
  sourceTitle: string;
  publishedAt: string | null;
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

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: [
          'You write posts for X (formerly Twitter) for TED, a SaaS platform that helps companies find, analyze, and win public procurement tenders.',
          'Follow these house style guidelines exactly:',
          input.guidelines,
          this.buildFeaturesGuidance(input),
          formatInstruction,
          this.buildTopicGuidance(input),
          this.buildCompanyStoryGuidance(input),
          this.buildInterestingTenderGuidance(input),
          this.buildMarketInsightGuidance(input),
          this.buildHistoricalStoryGuidance(input),
          this.buildLinkGuidance(input),
          'Return JSON only in this exact shape: {"posts":["..."],"hashtags":["..."],"notes":"..."}.',
          '"posts" is an ordered array of post bodies. "hashtags" contains at most 1 hashtag without the # symbol, or an empty array. "notes" is one short, SUBSTANTIVE sentence stating why this specific subject was chosen (e.g. "exceptional_value: 12x the category median" or "repeat_buyer: 4th award from the same buyer") — never a generic data-provenance restatement like "sourced from Tenderwize data" or "currently open; deadline, buyer, value confirmed", which tells the reader nothing they can\'t already see in the post.',
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
            companyStoryFacts: input.companyStoryFacts
              ? (JSON.parse(input.companyStoryFacts) as unknown)
              : null,
            externalFacts: input.externalFacts
              ? (JSON.parse(input.externalFacts) as unknown)
              : null,
            detectedInterestingTender: input.detectedInterestingTender
              ? (JSON.parse(input.detectedInterestingTender) as unknown)
              : null,
            detectedMarketInsight: input.detectedMarketInsight
              ? (JSON.parse(input.detectedMarketInsight) as unknown)
              : null,
            historicalStoryTopic: input.historicalStoryTopic ?? null,
          },
          null,
          2,
        ),
      },
    ];

    // Server-side enforcement of the ceiling/lump-sum wording rule — see
    // generateXPostWithData's identical check. Only Company Story /
    // Interesting Tender facts carry the isDps/isFrameworkAgreement or
    // valueRepresents markers this looks for.
    const needsCeilingHedge = this.requiresCeilingHedge(input);
    const maxAttempts = needsCeilingHedge ? 2 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response =
        await this.generalConnection.client.chat.completions.create({
          model: this.generalConnection.model,
          messages,
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
      const validated = this.validateXPostResult(parsed);

      if (
        needsCeilingHedge &&
        attempt < maxAttempts - 1 &&
        validated.posts.length > 0
      ) {
        const text = validated.posts.join(' ').toLowerCase();

        if (!text.includes('ceiling') && !text.includes('up to')) {
          messages.push({ role: 'assistant', content: responseText });
          messages.push({
            role: 'user',
            content:
              'Rejected: this is a DPS or framework agreement, but your draft phrases its value as a completed purchase rather than a ceiling. Rewrite the post so the sentence stating the amount contains the word "ceiling" or the phrase "up to" (e.g. "a €2.66bn ceiling framework", not "awarded a €2.66bn framework"), then return the same JSON format again.',
          });
          continue;
        }
      }

      return validated;
    }

    throw new ServiceUnavailableException(
      `${this.generalConnection.providerName} did not produce a value-hedge-compliant answer`,
    );
  }

  /** Whether companyStoryFacts/detectedInterestingTender marks the value as a DPS/framework ceiling — see generateXPost's server-side wording check. */
  private requiresCeilingHedge(input: GenerateXPostInput): boolean {
    for (const raw of [input.companyStoryFacts, input.detectedInterestingTender]) {
      if (!raw) continue;

      try {
        const parsed: unknown = JSON.parse(raw);

        if (!isRecord(parsed)) continue;
        if (parsed.isDps === true || parsed.isFrameworkAgreement === true) {
          return true;
        }

        const evidence = isRecord(parsed.detectedStory)
          ? parsed.detectedStory.evidence
          : undefined;

        if (
          isRecord(evidence) &&
          (evidence.valueRepresents === 'ceiling_over_multiple_years' ||
            evidence.isDps === true ||
            evidence.isFrameworkAgreement === true)
        ) {
          return true;
        }
      } catch {
        // ignore malformed JSON — hedge requirement simply doesn't apply
      }
    }

    return false;
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
      this.buildFeaturesGuidance(input),
      formatInstruction,
      this.buildTopicGuidance(input),
      this.buildLinkGuidance(input),
      "You have a tool to fetch real data from Tenderwize's database. You MUST call it at least once before writing anything, and every specific fact in the post (buyer, winner, amount, date, count, CPV code) MUST come from a tool result — never invent, estimate, or round a number that is not present in a tool result.",
      "IMPORTANT value-framing rule: if a tool result's isDps or isFrameworkAgreement is true, its amount is a ceiling/indicative maximum over that mechanism's whole lifetime — never phrase it as a single purchase or a lump sum paid/spent outright. See the tool's own description for the exact wording to use.",
      'If a tool call returns no matching items (an empty items array), call it again once with broader parameters (drop some filters). If it is still empty after that, do not write a post about invented data — respond with the final JSON answer using an empty "posts" array and explain in "notes" that no matching data was found.',
      "When you do have results, don't just pick the single highest-value record and describe it — that produces a generic \"biggest number\" post with no real reason to care. Look across the results you fetched (query a few different angles if it helps) for something a reader would find genuinely notable: a value that stands out even among other large records, an unusual buyer/subject, a striking deadline, or similar — then pick ONE record to write about that. If you used a stats tool instead, write about the returned numbers.",
      'Final answer format: JSON only, no markdown code fences, in this exact shape: {"posts":["..."],"hashtags":["..."],"notes":"...","usedSourceIds":["..."]}.',
      '"notes" is one short, SUBSTANTIVE sentence stating why you picked this specific record (e.g. "unusually large framework relative to typical awards in this category" or "rare buyer publishing at this scale") — never a generic data-provenance restatement like "selected the highest-value recent award returned" or "sourced from Tenderwize data", which tells the reader nothing they can\'t already see in the post.',
      '"usedSourceIds" must contain the "id" field(s) of the tool-result record(s) you actually used — an empty array if you used a stats tool or found no data.',
      'HARD REQUIREMENT, checked before you finalize: if the record you are writing about has isDps=true or isFrameworkAgreement=true, the sentence stating its amount MUST contain the word "ceiling" or the phrase "up to" — e.g. "a €2.66bn ceiling framework" or "a framework worth up to €2.66bn". Do NOT write a sentence whose main clause is "X awarded Y a €Z [framework/DPS]" — that phrasing reads as a completed €Z payment regardless of the word "framework" appearing later. Re-read your draft against this exact check before returning it.',
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
    // Ids of any tool-result record whose isDps/isFrameworkAgreement was
    // true — the value-framing HARD REQUIREMENT above applies to these.
    // Tracked from the raw tool results themselves (never from the model's
    // claims) so the check below can't be talked out of firing.
    const ceilingRecordIds = new Set<string>();
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

          if (isRecord(toolResult) && Array.isArray(toolResult.items)) {
            for (const item of toolResult.items) {
              if (
                isRecord(item) &&
                typeof item.id === 'string' &&
                (item.isDps === true || item.isFrameworkAgreement === true)
              ) {
                ceilingRecordIds.add(item.id);
              }
            }
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

      const usesCeilingRecord = usedSourceIds.some((id) =>
        ceilingRecordIds.has(id),
      );
      const postsText = validated.posts.join(' ').toLowerCase();
      const hedgesCeiling =
        postsText.includes('ceiling') || postsText.includes('up to');

      if (
        usesCeilingRecord &&
        !hedgesCeiling &&
        validated.posts.length > 0 &&
        round < maxRounds - 1
      ) {
        // Server-side enforcement of the value-framing HARD REQUIREMENT —
        // don't just hope the model followed a buried prompt instruction.
        messages.push({ role: 'assistant', content });
        messages.push({
          role: 'user',
          content:
            'Rejected: the record you used is a DPS or framework agreement (isDps/isFrameworkAgreement=true), but your draft phrases its value as a completed purchase rather than a ceiling. Rewrite the post so the sentence stating the amount contains the word "ceiling" or the phrase "up to" (e.g. "a €2.66bn ceiling framework", not "awarded a €2.66bn framework"), then return the same JSON format again.',
        });
        continue;
      }

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
   * Extracts verifiable factual claims from a small set of already-fetched,
   * allow-listed web pages (see WebEnrichmentService) — this is a separate,
   * narrower call from generateXPost: this model only ever sees literal
   * page text and must not add anything beyond it. Every returned fact's
   * `sourceUrl` is verified against the set of pages actually given before
   * being returned, so a hallucinated source can never slip through.
   */
  async extractExternalFacts(
    input: ExtractExternalFactsInput,
  ): Promise<ExtractedExternalFact[]> {
    if (input.pages.length === 0) return [];

    const response =
      await this.generalConnection.client.chat.completions.create({
        model: this.generalConnection.model,
        messages: [
          {
            role: 'system',
            content: [
              'You extract verifiable factual claims about a specific public procurement subject from web page text, for a fact-checked news brief.',
              'Rules:',
              '- Only extract a fact if it is EXPLICITLY stated in the given page text. Never infer, generalize, combine multiple pages, or add anything from outside knowledge.',
              '- Each fact must come from exactly one page. Copy that page\'s `url`, `title`, and `publishedAt` exactly as given in the input — never alter, guess, or invent any of the three.',
              `- Only extract facts relevant to ${input.subjectName}${input.context ? ` (context: ${input.context})` : ''}. Ignore unrelated content on the page (navigation, ads, unrelated news, boilerplate).`,
              '- If a page contains nothing relevant and verifiable, extract nothing from it — an empty result is normal and expected, most pages will not qualify.',
              '- Keep each fact to one concise, neutral sentence — no speculation, no opinion, no marketing language.',
              'Return JSON only, no markdown fences, in this exact shape: {"facts":[{"fact":"...","sourceUrl":"...","sourceTitle":"...","publishedAt":"...or null"}]}. Return {"facts":[]} if nothing qualifies.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({ pages: input.pages }, null, 2),
          },
        ],
        ...this.getChatCompletionOptions(this.generalConnection),
        stream: false,
      });
    const content = response.choices[0]?.message.content;

    if (!content) return [];

    const parsed = this.parseModelJson(content);

    if (!isRecord(parsed) || !Array.isArray(parsed.facts)) return [];

    const allowedUrls = new Set(input.pages.map((page) => page.url));

    return parsed.facts
      .filter((fact): fact is Record<string, unknown> => isRecord(fact))
      .map((fact) => ({
        fact: typeof fact.fact === 'string' ? fact.fact.trim() : '',
        sourceUrl: typeof fact.sourceUrl === 'string' ? fact.sourceUrl : '',
        sourceTitle:
          typeof fact.sourceTitle === 'string' ? fact.sourceTitle : '',
        publishedAt:
          typeof fact.publishedAt === 'string' ? fact.publishedAt : null,
      }))
      .filter((fact) => fact.fact && allowedUrls.has(fact.sourceUrl));
  }

  /**
   * Builds the "pick the subject yourself" / "avoid repeating past posts"
   * instructions. Returns '' when a topic was given and there's no history
   * to avoid, so callers can filter it out of the prompt.
   */
  private buildTopicGuidance(input: GenerateXPostInput): string {
    const lines: string[] = [];
    const hasTopic = Boolean(input.topic && input.topic.trim());

    if (
      !hasTopic &&
      !input.companyStoryFacts &&
      !input.detectedInterestingTender &&
      !input.detectedMarketInsight &&
      !input.historicalStoryTopic
    ) {
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

  /**
   * "Company Story" is a Contract Award angle told in two stages. Stage 1
   * (backend, deterministic, no LLM involved) already ran before this
   * prompt was built: XPostDataService.buildCompanyStoryFacts computed a
   * supplier's full award history and ran it through
   * company-story-detector.ts, which either found a statistically-confirmed
   * pattern (`detectedStory`) or didn't — a candidate without one is never
   * even sent here. Stage 2 is this call: the model's ONLY job is turning
   * an already-confirmed pattern into a good sentence. It never decides
   * whether a story exists — that was already decided by real arithmetic
   * over real award records, which the model cannot second-guess or
   * override. Returns '' when this generation isn't a Company Story.
   */
  private buildCompanyStoryGuidance(input: GenerateXPostInput): string {
    if (!input.companyStoryFacts) return '';

    return [
      [
        'This is a Contract Award "Company Story". The backend has ALREADY confirmed a genuine pattern in this supplier\'s full award history — see `detectedStory` in the `companyStoryFacts` field of the user message below (its `type`, a `score`, a `summary`, and `evidence`).',
        'Your only job is to turn that already-confirmed pattern into a good post. Do not search the data for a different pattern, do not second-guess whether detectedStory is "really" a story, and do not fall back to describing the supplier\'s totals instead — the detection already happened; you are not repeating it.',
      ].join(' '),
      [
        'Treat every number in `companyStoryFacts` as ground truth. State ONLY facts present in `detectedStory.evidence` (plus, if needed for the hook, `winnerName`, `awardCount`, `knownTotalValueEur`, `latestAward`, `largestAward`) — never a number from `awardTimeline` or anything else that isn\'t in the evidence you were given for this specific pattern.',
        'A natural rounding (4,600,000 -> "€4.6M") is fine; inventing, estimating, or borrowing a number from outside `detectedStory.evidence` is not.',
      ].join(' '),
      [
        `The pattern type tells you how to frame it:`,
        `growth — evidence.countsByYear/totalsByYear across evidence.years: frame as size or volume increasing across those specific years, not "the latest award vs the largest".`,
        `acceleration — evidence.firstHalfCount vs secondHalfCount over evidence.periodStart–periodEnd: frame as pace picking up.`,
        `repeat_buyer — evidence.buyerAwardCount awards with evidence.buyerName (out of evidence.totalAwardCount total): frame as a recurring relationship.`,
        `buyer_expansion — evidence.earlyBuyers vs evidence.newBuyers: frame as the buyer base widening.`,
        `market_expansion — evidence.earlyCountries vs evidence.newCountries: frame as geographic expansion.`,
        `exceptional_win — evidence.valueEur is evidence.ratio times evidence.medianOfOtherAwardsEur: frame as a standout, not a typical win, citing the ratio.`,
        `specialization — evidence.matchingCount of evidence.totalWithCategory awards are the same kind of work (see evidence.exampleTitles for real wording instead of a raw CPV code), demonstrated across evidence.buyerCount buyers in evidence.countryCount countries: frame as a focus that holds up across that many different buyers/countries, not just a bare ratio.`,
        `milestone — evidence.awardCount or evidence.threshold/evidence.cumulativeAfterEur: frame as a genuine, round threshold just reached — never imply it if the number isn\'t actually round.`,
      ].join('\n'),
      [
        'The hook must be the concrete number(s) from the evidence, not an abstract label for the pattern. "That\'s a clear specialization." or "This shows strong specialization." is a restatement of the pattern\'s name, not a story — it tells the reader nothing they can picture. Lead with the actual ratio/count/contrast instead.',
        'Bad hook: "Amgen shows a clear specialization in its public procurement footprint." (labels the pattern, no number)',
        'Good hook: "64 out of 65." followed by what that count means (e.g. "That\'s how concentrated Amgen\'s disclosed awards are in one category — pharmaceutical products, per Tenderwize data.")',
        'When `knownTotalValueEur` is present and not null, adding it as a second, separate fact (scale on top of the pattern) makes for a stronger post than the pattern alone — e.g. pattern first, then "Its disclosed awards in our data total €386.8M." as a supporting line, not the hook.',
      ].join(' '),
      [
        'One-sentence test (this sentence IS the `notes` field): "Why is this interesting?" — it must reference the specific pattern (e.g. "acceleration: 3 awards in the first half of its history vs 12 in the second"), never a generic reason like "it has several awards" or "the total is large".',
      ].join(' '),
      [
        'The only case where you may still decline is if the given evidence is genuinely too thin to write a clear, honest sentence about (e.g. a buyer/title field is missing in a way that makes the claim unstatable) — in that rare case return exactly {"posts":[],"hashtags":[],"notes":"NO_STORY_FOUND"}. Do not decline merely because the pattern feels modest; if it\'s in `detectedStory`, it already cleared the backend\'s bar.',
      ].join(' '),
      input.externalFacts
        ? [
            'The `externalFacts` field in the user message below is a list of independently-verified facts found on the open web (an official company/buyer site, a .gov/EU domain, or a small curated list of business press) — each one already carries its own `sourceUrl`, so you never need to add a citation inline in the post itself.',
            'You may use these to add real, concrete context to the pattern (what the contract is actually for, why it matters, a detail a press release disclosed) — but ONLY state something that appears in one of these `fact` strings verbatim or as a direct paraphrase. Never blend in outside knowledge about the supplier, the buyer, or the industry that isn\'t in this list — if `externalFacts` is empty or absent, write the post from `companyStoryFacts` alone, exactly as if this paragraph didn\'t exist.',
            'Do NOT use an externalFacts sourceUrl as the post\'s link/CTA — the Tenderwize award link (see link guidance below) stays the destination; external sources are for factual richness and admin verification only, never a competing outbound link.',
          ].join(' ')
        : '',
      [
        'Critical wording rule: Tenderwize does not see every contract a company has ever won, only what is in our data. Never phrase this as the company\'s total or complete record.',
        'Wrong: "Company X has won 7 public contracts" / "has earned €28.4M from public procurement".',
        'Right: "Company X appears in 7 awards in Tenderwize\'s data" / "we found 7 awards" / "its disclosed awards in our data total €28.4M".',
        'Apply this hedge whenever you state awardCount or knownTotalValueEur.',
      ].join(' '),
      "For the link/CTA, use an award id present in `detectedStory.evidence` (e.g. evidence.awardId or one of evidence.awardIds) or latestAward.id/largestAward.id as the real award id if you build a URL from a ROUTES.md award-page pattern (see link guidance below) — these ids are real values from this generation's data, exactly like a tool result's id would be.",
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Interesting Tender, when this tender was selected via a
   * statistically-confirmed pattern (interesting-tender-detector.ts) rather
   * than a plain value_desc pick. Same discipline as buildCompanyStoryGuidance:
   * the backend already decided WHY this tender is worth posting about; the
   * model only phrases it. Returns '' when this generation is a plain
   * tool-based Interesting Tender pick instead (no detectedInterestingTender).
   */
  private buildInterestingTenderGuidance(input: GenerateXPostInput): string {
    if (!input.detectedInterestingTender) return '';

    return [
      [
        'This Interesting Tender was selected because the backend already confirmed a specific, statistically real reason it stands out — see `detectedStory` in the `detectedInterestingTender` field of the user message below (its `type`, `score`, `summary`, and `evidence`). A large value alone is never sufficient reason on its own; the pattern IS the reason.',
        'Your only job is to phrase that already-confirmed reason well. Do not invent a different reason (e.g. "a major opportunity" with nothing backing "major"), and do not state anything beyond `detectedInterestingTender`\'s fields.',
      ].join(' '),
      [
        'CRITICAL value-framing rule: check `evidence.valueRepresents` (or `isDps`/`isFrameworkAgreement` at the top level of `detectedInterestingTender`) before writing any amount. If it is `"ceiling_over_multiple_years"`, the value is a MAXIMUM/INDICATIVE ceiling for a Dynamic Purchasing System or framework agreement spread over its whole duration — NEVER phrase it as a single purchase or a lump-sum contract.',
        'Wrong: "€20bn for medicines." (implies one purchase)',
        'Right: "A €20bn ceiling for a pharmaceutical purchasing system." / "ESTAR has set up a dynamic purchasing system for medicines, with an indicated value of up to €20bn running to [deadline]."',
        'If `valueRepresents` is `"estimated_contract_value"` instead, the amount is a normal single-procurement estimate and can be stated directly.',
      ].join(' '),
      [
        'The pattern type tells you what to emphasize — cite ONLY the fields it actually gives you:',
        'exceptional_value — evidence.ratio vs evidence.categoryMedianValueEur/evidence.categorySampleSize: frame as notably above what similar currently-open tenders are worth, not just "huge".',
        'long_term_mechanism — evidence.durationMonths, isDps/isFrameworkAgreement: frame as a multi-year purchasing mechanism, not a one-off award.',
        'complex_structure — evidence.lotsCount: frame as a program split across that many lots.',
        'short_deadline — evidence.remainingDays vs evidence.estimatedValueEur: frame as urgency worth acting on now.',
        'cross_border — evidence.countries: frame as spanning those specific countries.',
        'rare_category — evidence.historicalCategoryCount/evidence.cpvCode: frame as an unusual procurement subject, backed by the rarity count, not a vague "unusual" claim.',
        'unusual_buyer — evidence.buyerTendersCount/evidence.buyerName: frame as a rare or first-time publisher at this scale.',
      ].join('\n'),
      'One-sentence test (this sentence IS the `notes` field): "Why is this interesting?" — it must name the specific pattern and its number (e.g. "exceptional_value: ~12x the category median"), never a generic reason like "it\'s a major opportunity" or a data-provenance restatement like "currently open, deadline/buyer/value confirmed".',
      'Standard Interesting Tender rules still apply: verify the deadline is still in the future, ground buyer/country/CPV/value in the given data, and link to the tender\'s own Tenderwize URL (see link guidance below).',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Market Insight, when the subject was backed by a statistically-confirmed
   * trend (market-insight-detector.ts) rather than the model exploring
   * get_market_stats itself. Same discipline as the other two: the backend
   * already found and scored the trend across a scanned set of
   * countries/CPV categories; the model only phrases it. Returns '' for a
   * plain tool-based Market Insight generation instead.
   */
  private buildMarketInsightGuidance(input: GenerateXPostInput): string {
    if (!input.detectedMarketInsight) return '';

    return [
      [
        'This Market Insight was selected because the backend already confirmed a specific, statistically real trend — see `type`, `score`, `summary`, and `evidence` in the `detectedMarketInsight` field of the user message below. It was chosen by scanning "Overall" plus the top active countries and CPV categories for a real percentage swing with a minimum sample size (or genuinely new activity), not by exploring the data yourself.',
        'Your only job is to phrase that already-confirmed trend well. Do not search for a different trend, do not state any number outside `evidence`, and do not imply this covers the entire EU market — it is Tenderwize-tracked data for the stated scope and period only.',
      ].join(' '),
      [
        'surge / decline — evidence.currentCount vs evidence.previousCount over evidence.periodDays days, with evidence.changePercent: frame as an increase/decrease of that magnitude in that specific scope (country or CPV category named in evidence.label), not a bare number.',
        'new_activity — evidence.currentCount vs a previousCount near zero: frame as a market/category that has newly become active, not a percentage (there is no meaningful percentage from ~0).',
      ].join('\n'),
      'Always state the time window explicitly (evidence.periodDays days) per the guidelines\' Market Insight rules. If evidence.currentValueEur is present, you may add it as a supporting scale detail ("worth a combined €X in disclosed value") — but the count-based trend is the actual finding; never lead with the value alone or treat it as the trend itself.',
      'One-sentence test (this sentence IS the `notes` field): name the specific trend, scope, and magnitude (e.g. "surge: +85% tenders in Germany\'s CPV 45 category over 90 days"), never a generic reason.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Historical Story: unlike every other facts-grounded mode, there is no
   * Tenderwize DB payload — grounding is entirely `externalFacts`, gathered
   * by WebEnrichmentService.enrichHistoricalStory. The caller
   * (XPostService) only ever sets historicalStoryTopic when it already has
   * real verified facts to go with it, but this prompt still treats an
   * empty externalFacts as a hard stop rather than trusting the model to
   * fill the gap from memory.
   */
  private buildHistoricalStoryGuidance(input: GenerateXPostInput): string {
    if (!input.historicalStoryTopic) return '';

    return [
      [
        `This is a Historical Story about: ${input.historicalStoryTopic}. This is NOT live Tenderwize data — it is a real past event, and every specific claim you make (a date, an amount, a name, an outcome, a quote) MUST come from the \`externalFacts\` field in the user message below, each of which already carries its own verified \`sourceUrl\`.`,
        'You almost certainly "know" things about this topic from training — DO NOT use that knowledge. Any fact not present in `externalFacts` does not exist for this post, no matter how confident you are it\'s true, because it cannot be verified the way everything else in this pipeline is. If `externalFacts` is empty or too thin to support a real narrative, return exactly {"posts":[],"hashtags":[],"notes":"NO_STORY_FOUND"} rather than filling the gap from memory.',
      ].join(' '),
      [
        'Structure: hook = the single most striking verified fact (a number, a contrast, a consequence) in one line; 2-4 lines telling the actual story using only verified facts, in chronological or cause-effect order; optionally, ONE line drawing a soft, honest parallel to public procurement today (never claim Tenderwize could have "prevented" the specific historical event — that\'s not a verifiable claim).',
        'This pillar is evergreen and editorial, not a live discovery — do not phrase it as "Tenderwize data shows..." or imply Tenderwize tracked or found this; it did not, this is public history.',
      ].join(' '),
      'Never invent a quote, an exact figure, or a causal claim ("this caused the company to collapse") that isn\'t directly stated in `externalFacts` — paraphrase what the sources say, don\'t dramatize beyond it.',
      'One-sentence test (this sentence IS the `notes` field): name the specific verified fact the story is built around (e.g. "1,357% cost overrun documented in the enrichment sources"), never a generic reason.',
      'There is no Tenderwize record to link to for this pillar — per the link guidance below, use the homepage only if a natural, unforced tie-in fits, otherwise no link at all. Never link to one of the `externalFacts` source URLs as the post\'s own CTA.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Gives the model the fixed list of real Tenderwize features it may cite
   * for the "Tenderwize capability" step of the value-first formula
   * (guidelines section 3). Without this, the model has no grounded feature
   * list and would either skip product mentions entirely or invent one.
   */
  private buildFeaturesGuidance(input: GenerateXPostInput): string {
    if (!input.features) {
      return 'No feature list was provided for this generation. Do not describe or reference any specific Tenderwize feature — stick to pure procurement value, or a generic phrase like "Tenderwize" with no capability claim.';
    }

    return [
      'When the value-first formula (guidelines section 3) calls for connecting to a Tenderwize capability, pick ONLY from this list of real features — never invent, guess, or embellish one that is not here:',
      input.features,
      'Rule: if the post names or describes a specific feature from this list, it MUST also end with a link (see the link/CTA guidance below - the homepage URL, or a more specific one if you were given one) so the reader can actually act on it. A feature mention with no clickable link is not allowed. If you decide not to include a link, do not name a feature either - keep the post to pure procurement value with no product mention.',
    ].join('\n\n');
  }

  /**
   * Tells the model exactly which URL(s) it is allowed to use, per the
   * "never fabricate a URL" rule in the guidelines (section 9). Priority:
   * 1) a tool result's own `url` field, used verbatim; 2) a URL built from
   * `input.routes` (the frontend's live ROUTES.md) + `input.clientUrl`,
   * substituting only real values a tool already returned; 3) the homepage
   * fallback. The model must never use any other domain or invent a path or
   * placeholder value — XPostService also strips any line whose URL doesn't
   * match a known origin as a backstop.
   */
  private buildLinkGuidance(input: GenerateXPostInput): string {
    const lines: string[] = [];

    if (input.routes && input.clientUrl) {
      lines.push(
        [
          `Here is the real, current list of Tenderwize frontend pages (ROUTES.md), fetched live from ${input.clientUrl}:`,
          input.routes,
        ].join('\n\n'),
        [
          `You may build a URL yourself ONLY by combining ${input.clientUrl} with one of the exact path patterns listed above, substituting any placeholder in that pattern with a real value already present in this conversation — an id, country code, CPV category, or similar that an actual tool result returned.`,
          'Never invent, guess, or round a value to fill a placeholder. Never use a path/pattern that is not listed above. Never use any domain other than the one shown above.',
          'If no listed pattern genuinely matches what the post is about, do not force one — fall back per the priority below instead.',
        ].join(' '),
      );
    } else {
      lines.push(
        'No route list (ROUTES.md) was available for this generation (fetch failed or not configured). Do not construct any path yourself under any circumstances.',
      );
    }

    if (input.homepageUrl) {
      lines.push(
        [
          `The only other URL you may use, as a last-resort fallback (link priority level 5 in the guidelines), is: ${input.homepageUrl}`,
          "Use it only if a link genuinely fits and nothing more specific is available (a tool result's own url field, or a URL built from ROUTES.md above). Never modify it or append a path to it.",
        ].join(' '),
      );
    } else {
      lines.push(
        'No homepage URL was provided either. If you have no other real URL to use, do not include any link in the post.',
      );
    }

    lines.push(
      'Link priority, most to least specific: (1) a url field returned directly by a tool result, (2) a URL you built from ROUTES.md using only real values from tool results, (3) the homepage fallback above, (4) no link at all.',
    );

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
