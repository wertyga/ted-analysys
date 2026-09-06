import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import mongoose from 'mongoose';
import { getPaginationMeta } from '@/utils';
import {
  GenerateXPostInput,
  GenerateXPostResult,
  LlmAnalysisService,
} from '@/llm/llm-analysis.service';
import {
  GenerateXPostDto,
  GetXPostsRequestDto,
  UpdateXPostDto,
} from './dto/x-post.dto';
import {
  XPostFormat,
  XPostModel,
  XPostPillar,
  XPostSource,
  XPostStatus,
  XPostStoryAngle,
} from './schemas';
import { XPostImageService } from './image/x-post-image.service';
import {
  CompanyStoryFacts,
  TENDERWIZE_ORIGIN,
  XPostDataService,
} from './x-post-data.service';
import { ExternalFact, WebEnrichmentService } from './web-enrichment.service';
import {
  DetectedInterestingTender,
  TenderCandidateFacts,
} from './interesting-tender-detector';
import { detectBestMarketInsight } from './market-insight-detector';
import { HISTORICAL_STORY_TOPICS } from './historical-story-topics';

const NO_DATA_MESSAGE =
  'No matching real data was found for this topic. Try a broader or more specific topic (a different country, category, or value range).';
const NO_COMPANY_STORY_MESSAGE =
  'No strong company story found among recent candidates. Try again later (new awards may qualify), or use Auto.';
const NO_HISTORICAL_STORY_MESSAGE =
  'No verifiable historical story found (web enrichment found nothing usable for any candidate topic). Try again later, or give a specific topic.';
const HISTORICAL_STORY_DISABLED_MESSAGE =
  'Historical Story requires web enrichment to verify facts (BRAVE_API_KEY is not configured) — this pillar never writes from unverified memory.';
/** How many candidate topics to try enriching before giving up. */
const HISTORICAL_STORY_MAX_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Never retell the same company's story within this window, regardless of new data. */
const COMPANY_STORY_MIN_COOLDOWN_DAYS = 90;
/** After this much time, allow a retelling even without a meaningful new development. */
const COMPANY_STORY_HARD_RESET_DAYS = 365;
/**
 * How many cooldown-eligible companies to scan for a statistically-confirmed
 * pattern (see company-story-detector.ts) before giving up. This is cheap —
 * pure arithmetic, no LLM call — so scanning deeply is fine: most suppliers
 * won't have a genuine pattern, and a data-rich one shouldn't be skipped
 * just because the first few candidates tried didn't qualify.
 */
const COMPANY_STORY_SCAN_LIMIT = 50;
/** Of the scanned candidates with a confirmed pattern, how many (best score first) to keep for web enrichment. */
const COMPANY_STORY_RANK_KEEP = 10;
/**
 * Of the ranked candidates, how many to actually try web enrichment on
 * before giving up — enrichment costs a search API call + page fetches +
 * an LLM extraction call, so this is deliberately small even though
 * COMPANY_STORY_RANK_KEEP is larger.
 */
const COMPANY_STORY_ENRICH_ATTEMPTS = 3;

@Injectable()
export class XPostService {
  private readonly logger = new Logger(XPostService.name);
  private guidelinesCache?: string;
  private featuresCache?: string;

  constructor(
    private readonly llmAnalysisService: LlmAnalysisService,
    private readonly xPostImageService: XPostImageService,
    private readonly xPostDataService: XPostDataService,
    private readonly webEnrichmentService: WebEnrichmentService,
  ) {}

  private getGuidelines(): string {
    if (!this.guidelinesCache) {
      this.guidelinesCache = readFileSync(
        join(process.cwd(), '.claude/skills/x-post/X_POSTS_GUIDELINES.md'),
        'utf-8',
      );
    }

    return this.guidelinesCache;
  }

  private getFeatures(): string {
    if (!this.featuresCache) {
      this.featuresCache = readFileSync(
        join(process.cwd(), '.claude/skills/x-post/FEATURES.md'),
        'utf-8',
      );
    }

    return this.featuresCache;
  }

  /**
   * Fetches the frontend's live route manifest (`{CLIENT_URL}/ROUTES.md`) so
   * the model can pick a real page pattern for the link/CTA (guidelines
   * section 9) instead of only ever getting a homepage fallback. Fetched
   * fresh on every generation (no cache) so a frontend route change is
   * picked up immediately; a fetch failure just means no route list for
   * this generation, not a hard error.
   */
  private async getRoutes(): Promise<string | undefined> {
    const clientUrl = process.env.CLIENT_URL;

    if (!clientUrl) return undefined;

    try {
      const response = await axios.get<string>(
        `${clientUrl.replace(/\/$/, '')}/ROUTES.md`,
        { timeout: 5000, responseType: 'text' },
      );

      return typeof response.data === 'string' && response.data.trim()
        ? response.data
        : undefined;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch ROUTES.md from ${clientUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return undefined;
    }
  }

  /**
   * Last line of defense against a hallucinated link: strips any line
   * containing a URL whose origin isn't one we actually supplied to the
   * model (TENDERWIZE_ORIGIN or CLIENT_URL), even though the prompt already
   * forbids constructing anything else (guidelines section 9).
   */
  private sanitizePostUrls(
    posts: string[],
    allowedOrigins: (string | undefined)[],
  ): string[] {
    const normalizedOrigins = allowedOrigins
      .filter((origin): origin is string => Boolean(origin))
      .map((origin) => origin.replace(/\/$/, ''));
    const urlPattern = /https?:\/\/\S+/gi;

    return posts.map((post) =>
      post
        .split('\n')
        .filter((line) => {
          const urls = line.match(urlPattern);

          if (!urls) return true;

          return urls.every((url) =>
            normalizedOrigins.some((origin) => url.startsWith(origin)),
          );
        })
        .join('\n')
        .trim(),
    );
  }

  private async getRecentlyCoveredSummaries(
    pillar: XPostPillar,
  ): Promise<string[]> {
    const recentPosts = await XPostModel.find({ pillar })
      .sort({ createdAt: -1 })
      .limit(15)
      .select('topic sourceSummary notes')
      .lean()
      .exec();

    return recentPosts
      .map((post) => post.sourceSummary || post.topic || post.notes)
      .filter((summary): summary is string =>
        Boolean(summary && summary.trim()),
      );
  }

  /**
   * Scans up to COMPANY_STORY_SCAN_LIMIT cooldown-eligible suppliers for
   * ones with a statistically-confirmed pattern (detectCompanyStoryPattern
   * in company-story-detector.ts — pure arithmetic, no LLM call), and
   * returns the top COMPANY_STORY_RANK_KEEP by pattern score. This is
   * "stage 1" of the three-stage design (DB detection → web enrichment →
   * LLM phrasing): the backend decides whether a real pattern exists at all
   * before anything downstream runs. Ranking (rather than "first that
   * qualifies") matters because stage 2 (web enrichment) is expensive and
   * only tried on a handful of the best candidates — see generateDraft.
   */
  private async rankCompanyStoryCandidates(): Promise<
    { winnerId: string; facts: CompanyStoryFacts }[]
  > {
    const candidates = await this.xPostDataService.findCompanyStoryCandidates(
      COMPANY_STORY_SCAN_LIMIT,
    );

    if (candidates.length === 0) return [];

    const priorStories = await XPostModel.find({
      pillar: XPostPillar.ContractAward,
      storyAngle: XPostStoryAngle.CompanyStory,
      sourceEntityId: { $in: candidates.map((c) => c.winnerId) },
    })
      .sort({ createdAt: -1 })
      .select('sourceEntityId storyFacts createdAt')
      .lean()
      .exec();

    const priorByEntity = new Map<
      string,
      { storyFacts?: Record<string, unknown>; createdAt?: Date }
    >();

    for (const story of priorStories) {
      const entityId = story.sourceEntityId;

      if (entityId && !priorByEntity.has(entityId)) {
        priorByEntity.set(entityId, story);
      }
    }

    const ranked: { winnerId: string; facts: CompanyStoryFacts }[] = [];

    for (const candidate of candidates) {
      const facts = await this.xPostDataService.buildCompanyStoryFacts(
        candidate.winnerId,
        candidate.winnerName,
      );

      if (!facts || !facts.detectedStory) continue;

      const prior = priorByEntity.get(candidate.winnerId);

      if (prior) {
        const daysSincePrior =
          (Date.now() - new Date(prior.createdAt ?? 0).getTime()) / DAY_MS;

        if (daysSincePrior < COMPANY_STORY_MIN_COOLDOWN_DAYS) continue;

        if (
          daysSincePrior < COMPANY_STORY_HARD_RESET_DAYS &&
          !this.hasMeaningfulDevelopment(prior.storyFacts, facts)
        ) {
          continue;
        }
      }

      ranked.push({ winnerId: candidate.winnerId, facts });
    }

    ranked.sort(
      (a, b) =>
        (b.facts.detectedStory?.score ?? 0) -
        (a.facts.detectedStory?.score ?? 0),
    );

    return ranked.slice(0, COMPANY_STORY_RANK_KEEP);
  }

  /**
   * Whether `current` is different enough from the last-told story
   * (`prior`) to be worth retelling before the hard reset window: a
   * different confirmed pattern type entirely, or the same type backed by
   * meaningfully more evidence (a bigger record award, a bigger disclosed
   * total, or a buyer/country not seen in the prior story).
   */
  private hasMeaningfulDevelopment(
    prior: Record<string, unknown> | undefined,
    current: CompanyStoryFacts,
  ): boolean {
    if (!prior) return true;

    const priorDetectedType = (
      prior.detectedStory as { type?: unknown } | null | undefined
    )?.type;

    if (
      typeof priorDetectedType === 'string' &&
      current.detectedStory &&
      priorDetectedType !== current.detectedStory.type
    ) {
      return true;
    }

    const priorAwardCount =
      typeof prior.awardCount === 'number' ? prior.awardCount : 0;

    if (current.awardCount <= priorAwardCount) return false;

    const priorLargestValue =
      typeof (prior.largestAward as { valueEur?: unknown } | undefined)
        ?.valueEur === 'number'
        ? (prior.largestAward as { valueEur: number }).valueEur
        : 0;
    const currentLargestValue = current.largestAward?.valueEur ?? 0;

    if (currentLargestValue > priorLargestValue * 1.1) return true;

    const priorTotalValue =
      typeof prior.knownTotalValueEur === 'number'
        ? prior.knownTotalValueEur
        : 0;

    if ((current.knownTotalValueEur ?? 0) > priorTotalValue * 1.15) {
      return true;
    }

    const priorBuyers = new Set(
      Array.isArray(prior.buyerNames) ? (prior.buyerNames as string[]) : [],
    );

    if (current.buyerNames.some((name) => !priorBuyers.has(name))) {
      return true;
    }

    const priorCountries = new Set(
      Array.isArray(prior.countries) ? (prior.countries as string[]) : [],
    );

    return current.countries.some((country) => !priorCountries.has(country));
  }

  private buildCompanyStorySourceSummary(
    facts: CompanyStoryFacts,
    externalFacts: ExternalFact[],
  ): string {
    const parts = [
      `Company story: ${facts.winnerName} — ${facts.awardCount} awards found in our data`,
      `Story source: Tenderwize data${externalFacts.length > 0 ? ` + ${externalFacts.length} external source${externalFacts.length === 1 ? '' : 's'}` : ''}`,
    ];

    if (facts.detectedStory) {
      parts.push(
        `detected pattern: ${facts.detectedStory.type} (score ${facts.detectedStory.score.toFixed(2)}) — ${facts.detectedStory.summary}`,
      );
    }

    if (facts.knownTotalValueEur !== null) {
      parts.push(
        `disclosed total ${facts.knownTotalValueEur.toLocaleString('en-US')} EUR`,
      );
    }

    if (facts.latestAward) {
      parts.push(
        `latest award ${facts.latestAward.id} (${
          facts.latestAward.valueEur !== null
            ? `${facts.latestAward.valueEur.toLocaleString('en-US')} EUR`
            : 'value unknown'
        }, ${facts.latestAward.date ?? 'date unknown'})`,
      );
    }

    if (facts.largestAward && facts.largestAward.id !== facts.latestAward?.id) {
      parts.push(
        `largest award ${facts.largestAward.id} (${facts.largestAward.valueEur.toLocaleString('en-US')} EUR, ${facts.largestAward.date ?? 'date unknown'})`,
      );
    }

    if (
      facts.firstAward &&
      facts.firstAward.id !== facts.latestAward?.id &&
      facts.firstAward.id !== facts.largestAward?.id
    ) {
      parts.push(
        `first award ${facts.firstAward.id} (${
          facts.firstAward.valueEur !== null
            ? `${facts.firstAward.valueEur.toLocaleString('en-US')} EUR`
            : 'value unknown'
        }, ${facts.firstAward.date ?? 'date unknown'})`,
      );
    }

    if (facts.topRepeatBuyer) {
      parts.push(
        `repeat buyer ${facts.topRepeatBuyer.name} (${facts.topRepeatBuyer.awardCount}x)`,
      );
    }

    if (facts.spanDays !== null) {
      parts.push(`spans ${facts.spanDays} days`);
    }

    return parts.join('; ');
  }

  /**
   * Stage 1 (deterministic, no LLM) of Interesting Tender selection: scans
   * a candidate pool of currently-open tenders (see
   * XPostDataService.findInterestingTenderCandidates — high-value AND
   * soon-closing, so short_deadline isn't starved by a value-only sort) and
   * returns the one with the best-scoring statistically-confirmed pattern
   * (interesting-tender-detector.ts), or null if none clears the bar. A
   * single category-baseline aggregation is computed once and reused across
   * every candidate rather than per-candidate.
   */
  private async selectInterestingTenderCandidate(): Promise<
    (TenderCandidateFacts & { detectedStory: DetectedInterestingTender }) | null
  > {
    const ids = await this.xPostDataService.findInterestingTenderCandidates(30);

    if (ids.length === 0) return null;

    const baselines =
      await this.xPostDataService.computeOpenTenderCategoryBaselines();

    let best:
      | (TenderCandidateFacts & { detectedStory: DetectedInterestingTender })
      | null = null;

    for (const id of ids) {
      const facts = await this.xPostDataService.buildInterestingTenderFacts(
        id,
        baselines,
      );

      if (!facts || !facts.detectedStory) continue;

      if (!best || facts.detectedStory.score > best.detectedStory.score) {
        best = facts as TenderCandidateFacts & {
          detectedStory: DetectedInterestingTender;
        };
      }
    }

    return best;
  }

  /**
   * Picks a Historical Story topic and verifies it against the open web
   * before returning it — never returns a topic without real, cited facts
   * to write from. Rotates through HISTORICAL_STORY_TOPICS avoiding
   * whatever this pillar has posted most recently (resetting once the
   * whole list has been used), and tries up to HISTORICAL_STORY_MAX_ATTEMPTS
   * candidates since some topics won't turn up anything on the allow-listed
   * sources.
   */
  private async selectHistoricalStoryTopic(): Promise<{
    topic: string;
    externalFacts: ExternalFact[];
  } | null> {
    const recentPosts = await XPostModel.find({
      pillar: XPostPillar.HistoricalStory,
    })
      .sort({ createdAt: -1 })
      .limit(HISTORICAL_STORY_TOPICS.length)
      .select('topic')
      .lean()
      .exec();

    const usedTopics = new Set(recentPosts.map((post) => post.topic));
    const unusedTopics = HISTORICAL_STORY_TOPICS.filter(
      (topic) => !usedTopics.has(topic),
    );
    // Once every topic has been posted recently, allow the full list again
    // rather than getting stuck.
    const pool =
      unusedTopics.length > 0 ? unusedTopics : [...HISTORICAL_STORY_TOPICS];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    for (const topic of shuffled.slice(0, HISTORICAL_STORY_MAX_ATTEMPTS)) {
      const externalFacts =
        await this.webEnrichmentService.enrichHistoricalStory(topic);

      if (externalFacts.length > 0) return { topic, externalFacts };

      this.logger.debug(
        `Historical Story topic "${topic}" had no usable web corroboration; trying next.`,
      );
    }

    return null;
  }

  async generateDraft(
    dto: GenerateXPostDto,
    createdBy?: mongoose.Types.ObjectId,
  ) {
    const format = dto.format ?? XPostFormat.Single;
    const [recentlyCovered, routes] = await Promise.all([
      this.getRecentlyCoveredSummaries(dto.pillar),
      this.getRoutes(),
    ]);
    const clientUrl = process.env.CLIENT_URL;
    const baseInput: GenerateXPostInput = {
      topic: dto.topic,
      pillar: dto.pillar,
      format,
      tone: dto.tone,
      notes: dto.notes,
      guidelines: this.getGuidelines(),
      features: this.getFeatures(),
      recentlyCovered,
      homepageUrl: `${TENDERWIZE_ORIGIN}/en`,
      routes,
      clientUrl,
    };

    let result: GenerateXPostResult | undefined;
    let sourceIds: string[] = [];
    let sourceSummary: string | undefined;
    let storyAngle: XPostStoryAngle | undefined;
    let sourceEntityId: string | undefined;
    let storyFacts: Record<string, unknown> | undefined;
    let externalFacts: ExternalFact[] = [];
    let topicOverride: string | undefined;

    if (dto.pillar === XPostPillar.HistoricalStory) {
      // This pillar has no Tenderwize DB signal at all — grounding comes
      // entirely from web-enrichment-verified facts, so it either succeeds
      // with a real, cited topic or refuses outright; there is no generic
      // tool-based fallback to drop into (see historical-story-topics.ts).
      if (!this.webEnrichmentService.isEnabled()) {
        throw new BadRequestException(HISTORICAL_STORY_DISABLED_MESSAGE);
      }

      const requestedTopic = dto.topic?.trim();
      const chosen = requestedTopic
        ? await (async () => {
            const facts =
              await this.webEnrichmentService.enrichHistoricalStory(
                requestedTopic,
              );

            return facts.length > 0
              ? { topic: requestedTopic, externalFacts: facts }
              : null;
          })()
        : await this.selectHistoricalStoryTopic();

      if (!chosen) {
        throw new BadRequestException(NO_HISTORICAL_STORY_MESSAGE);
      }

      const historicalResult = await this.llmAnalysisService.generateXPost({
        ...baseInput,
        historicalStoryTopic: chosen.topic,
        externalFacts: JSON.stringify(
          chosen.externalFacts.map((fact) => ({
            fact: fact.fact,
            sourceUrl: fact.sourceUrl,
            sourceTitle: fact.sourceTitle,
            publishedAt: fact.publishedAt,
          })),
        ),
      });

      if (historicalResult.posts.length === 0) {
        throw new BadRequestException(NO_HISTORICAL_STORY_MESSAGE);
      }

      result = historicalResult;
      topicOverride = chosen.topic;
      externalFacts = chosen.externalFacts;
      sourceSummary = `Historical Story: ${chosen.topic} — Story source: ${chosen.externalFacts.length} external source${chosen.externalFacts.length === 1 ? '' : 's'}.`;
    }

    const wantsCompanyStory =
      dto.pillar === XPostPillar.ContractAward &&
      !dto.topic?.trim() &&
      (!dto.storyAngle ||
        dto.storyAngle === XPostStoryAngle.Auto ||
        dto.storyAngle === XPostStoryAngle.CompanyStory);

    if (wantsCompanyStory) {
      // Stage 1 (deterministic, no LLM): find suppliers whose award history
      // actually contains a statistically-confirmed pattern, best first.
      const ranked = await this.rankCompanyStoryCandidates();
      const webEnrichmentEnabled = this.webEnrichmentService.isEnabled();
      let chosen:
        | { winnerId: string; facts: CompanyStoryFacts; externalFacts: ExternalFact[] }
        | null = null;

      if (!webEnrichmentEnabled) {
        // No search API key configured — Company Story runs on Tenderwize
        // data alone, exactly as before web enrichment existed.
        if (ranked[0]) {
          chosen = { ...ranked[0], externalFacts: [] };
        }
      } else {
        // Stage 2 (deterministic search + strict extraction, no story-writing
        // LLM yet): try to corroborate the pattern with real external
        // sources, best-scoring candidate first. If a candidate's own
        // pattern is strong but the web has nothing to say about it, move
        // on to the next candidate rather than writing from thin context —
        // per the Company Story design, a candidate the web can't
        // corroborate at all is treated the same as "no story found".
        for (const candidate of ranked.slice(0, COMPANY_STORY_ENRICH_ATTEMPTS)) {
          const anchor = candidate.facts.latestAward;
          const found = await this.webEnrichmentService.enrichCompanyStory({
            supplierName: candidate.facts.winnerName,
            buyerName: anchor?.buyerNames[0],
            awardTitle: anchor?.title,
          });

          if (found.length > 0) {
            chosen = { ...candidate, externalFacts: found };
            break;
          }

          this.logger.debug(
            `Company Story candidate ${candidate.winnerId} (${candidate.facts.winnerName}) had a confirmed ${candidate.facts.detectedStory?.type} pattern but no usable web corroboration; trying next candidate.`,
          );
        }
      }

      if (!chosen) {
        if (dto.storyAngle === XPostStoryAngle.CompanyStory) {
          throw new BadRequestException(NO_COMPANY_STORY_MESSAGE);
        }
      } else {
        // Stage 3 (LLM): write about the already-confirmed, already-
        // corroborated pattern — the model is never asked to search for or
        // judge whether a story exists, only how to phrase the one the
        // backend already found and verified.
        const companyStoryResult = await this.llmAnalysisService.generateXPost(
          {
            ...baseInput,
            companyStoryFacts: JSON.stringify(chosen.facts),
            externalFacts:
              chosen.externalFacts.length > 0
                ? JSON.stringify(
                    chosen.externalFacts.map((fact) => ({
                      fact: fact.fact,
                      sourceUrl: fact.sourceUrl,
                      sourceTitle: fact.sourceTitle,
                      publishedAt: fact.publishedAt,
                    })),
                  )
                : undefined,
          },
        );

        if (companyStoryResult.posts.length === 0) {
          this.logger.warn(
            `Company Story candidate ${chosen.winnerId} (${chosen.facts.winnerName}) had a confirmed ${chosen.facts.detectedStory?.type} pattern (score ${chosen.facts.detectedStory?.score}) but the model still declined: ${companyStoryResult.notes}`,
          );

          if (dto.storyAngle === XPostStoryAngle.CompanyStory) {
            throw new BadRequestException(NO_COMPANY_STORY_MESSAGE);
          }
        } else {
          result = companyStoryResult;
          storyAngle = XPostStoryAngle.CompanyStory;
          sourceEntityId = chosen.winnerId;
          storyFacts = chosen.facts as unknown as Record<string, unknown>;
          externalFacts = chosen.externalFacts;
          sourceIds = Array.from(
            new Set(
              [
                chosen.facts.latestAward?.id,
                chosen.facts.largestAward?.id,
              ].filter((id): id is string => Boolean(id)),
            ),
          );
          sourceSummary = this.buildCompanyStorySourceSummary(
            chosen.facts,
            chosen.externalFacts,
          );
        }
      }
    }

    const wantsDetectedInterestingTender =
      dto.pillar === XPostPillar.InterestingTender && !dto.topic?.trim();

    if (wantsDetectedInterestingTender) {
      // Stage 1 (deterministic, no LLM): rank currently-open tenders by a
      // statistically-confirmed reason they stand out (see
      // interesting-tender-detector.ts) instead of raw value_desc.
      const top = await this.selectInterestingTenderCandidate();

      if (top) {
        // Stage 2 (optional): for value/duration-driven patterns, where
        // getting the value's meaning right matters most (see the
        // valueRepresents fix), try to find real corroborating context.
        // Unlike Company Story, a miss here doesn't disqualify the
        // candidate — the DB facts alone are already correctly framed.
        const needsEnrichment =
          top.detectedStory?.type === 'exceptional_value' ||
          top.detectedStory?.type === 'long_term_mechanism';
        const tenderExternalFacts =
          needsEnrichment && this.webEnrichmentService.isEnabled()
            ? await this.webEnrichmentService.enrichInterestingTender({
                buyerName: top.buyerNames[0] ?? top.title,
                tenderTitle: top.title,
                mechanismKeyword: top.isDps
                  ? 'dynamic purchasing system'
                  : top.isFrameworkAgreement
                    ? 'framework agreement'
                    : undefined,
              })
            : [];

        // Stage 3 (LLM): phrase the already-confirmed reason — the model
        // never decides whether this tender is interesting, only how to
        // say so.
        const tenderResult = await this.llmAnalysisService.generateXPost({
          ...baseInput,
          detectedInterestingTender: JSON.stringify(top),
          externalFacts:
            tenderExternalFacts.length > 0
              ? JSON.stringify(
                  tenderExternalFacts.map((fact) => ({
                    fact: fact.fact,
                    sourceUrl: fact.sourceUrl,
                    sourceTitle: fact.sourceTitle,
                    publishedAt: fact.publishedAt,
                  })),
                )
              : undefined,
        });

        if (tenderResult.posts.length > 0) {
          result = tenderResult;
          sourceIds = [top.id];
          sourceSummary =
            `Interesting Tender: detected pattern ${top.detectedStory?.type} (score ${top.detectedStory?.score.toFixed(2)}) — ${top.detectedStory?.summary}` +
            ` Story source: Tenderwize data${tenderExternalFacts.length > 0 ? ` + ${tenderExternalFacts.length} external source${tenderExternalFacts.length === 1 ? '' : 's'}` : ''}.`;
          externalFacts = tenderExternalFacts;
        } else {
          this.logger.warn(
            `Interesting Tender candidate ${top.id} had a confirmed ${top.detectedStory?.type} pattern (score ${top.detectedStory?.score}) but the model still declined: ${tenderResult.notes}. Falling back to a generic pick.`,
          );
        }
      }
    }

    const wantsDetectedMarketInsight =
      dto.pillar === XPostPillar.MarketInsight && !dto.topic?.trim();

    if (wantsDetectedMarketInsight) {
      // Stage 1 (deterministic, no LLM): scan "Overall" plus the top active
      // countries/CPV categories for a real percentage swing (with a
      // minimum sample size) or genuinely new activity — see
      // market-insight-detector.ts — instead of letting the model explore
      // get_market_stats itself and report whatever it found first.
      const slices = await this.xPostDataService.findMarketInsightSlices();
      const detected = detectBestMarketInsight(slices);

      if (detected) {
        // Stage 2 (LLM): phrase the already-confirmed trend.
        const marketResult = await this.llmAnalysisService.generateXPost({
          ...baseInput,
          detectedMarketInsight: JSON.stringify(detected),
        });

        if (marketResult.posts.length > 0) {
          result = marketResult;
          sourceSummary = `Market Insight: detected pattern ${detected.type} (score ${detected.score.toFixed(2)}) — ${detected.summary}`;
        } else {
          this.logger.warn(
            `Market Insight candidate had a confirmed ${detected.type} pattern (score ${detected.score}) but the model still declined: ${marketResult.notes}. Falling back to a generic pick.`,
          );
        }
      }
    }

    if (!result) {
      if (dto.pillar === XPostPillar.ProcurementInsight) {
        result = await this.llmAnalysisService.generateXPost(baseInput);

        if (result.posts.length === 0) {
          throw new InternalServerErrorException(
            'The AI did not return a post. Try again.',
          );
        }
      } else {
        const seenRecordSummaries = new Map<string, string>();
        const tools = this.xPostDataService.getToolsForPillar(dto.pillar);
        const executeTool = async (
          name: string,
          args: Record<string, unknown>,
        ) => {
          const execution = await this.xPostDataService.executeTool(
            name,
            args,
          );

          for (const record of execution.records) {
            seenRecordSummaries.set(record.id, record.summary);
          }

          return execution.result;
        };

        const generated = await this.llmAnalysisService.generateXPostWithData(
          baseInput,
          tools,
          executeTool,
        );
        const verifiedSourceIds = generated.usedSourceIds.filter((id) =>
          seenRecordSummaries.has(id),
        );
        const needsEntity =
          dto.pillar === XPostPillar.InterestingTender ||
          dto.pillar === XPostPillar.ContractAward;
        const needsStats = dto.pillar === XPostPillar.MarketInsight;

        if (
          generated.posts.length === 0 ||
          (needsEntity && verifiedSourceIds.length === 0) ||
          (needsStats && !generated.calledTools.includes('get_market_stats'))
        ) {
          throw new BadRequestException(NO_DATA_MESSAGE);
        }

        result = generated;
        sourceIds = verifiedSourceIds;
        sourceSummary =
          verifiedSourceIds
            .map((id) => seenRecordSummaries.get(id))
            .filter((summary): summary is string => Boolean(summary))
            .join(' | ') || undefined;
      }
    }

    const sanitizedPosts = this.sanitizePostUrls(result.posts, [
      TENDERWIZE_ORIGIN,
      clientUrl,
    ]);

    const storedTopic =
      dto.topic && dto.topic.trim()
        ? dto.topic.trim()
        : (topicOverride || sourceSummary || result.notes || 'Auto-selected by AI').slice(
            0,
            300,
          );

    const xPost = await XPostModel.create({
      topic: storedTopic,
      pillar: dto.pillar,
      storyAngle,
      format,
      posts: sanitizedPosts,
      hashtags: result.hashtags,
      notes: result.notes,
      status: XPostStatus.Draft,
      source: XPostSource.Ai,
      llmProvider: this.llmAnalysisService.getGeneralAnalysisProvider(),
      llmModel: this.llmAnalysisService.getGeneralAnalysisModel(),
      sourceIds,
      sourceSummary,
      sourceEntityId,
      storyFacts,
      externalFacts: externalFacts.map((fact) => ({
        fact: fact.fact,
        sourceUrl: fact.sourceUrl,
        sourceTitle: fact.sourceTitle,
        publishedAt: fact.publishedAt ?? undefined,
        retrievedAt: new Date(fact.retrievedAt),
      })),
      createdBy,
    });

    const imageUrl = await this.xPostImageService.renderAndUpload(
      {
        pillar: xPost.pillar,
        headline: xPost.posts[0],
        isThread: xPost.format === XPostFormat.Thread,
      },
      String(xPost._id),
    );

    if (imageUrl) {
      xPost.imageUrl = imageUrl;
      xPost.imageGeneratedAt = new Date();
      await xPost.save();
    }

    return XPostModel.serialize(xPost);
  }

  async regenerateImage(id: string) {
    const xPost = await XPostModel.findById(id).exec();

    if (!xPost) {
      throw new NotFoundException(`X post ${id} not found`);
    }

    const imageUrl = await this.xPostImageService.renderAndUpload(
      {
        pillar: xPost.pillar,
        headline: xPost.posts[0],
        isThread: xPost.format === XPostFormat.Thread,
      },
      String(xPost._id),
    );

    if (!imageUrl) {
      throw new Error('Failed to render X post image');
    }

    xPost.imageUrl = imageUrl;
    xPost.imageGeneratedAt = new Date();
    await xPost.save();

    return XPostModel.serialize(xPost);
  }

  async list(query: GetXPostsRequestDto) {
    const pagination = getPaginationMeta({
      page: query.page,
      limit: query.limit,
      defaultLimit: 20,
      maxLimit: 100,
    });
    const filter: Record<string, unknown> = {};

    if (query.status) filter.status = query.status;
    if (query.pillar) filter.pillar = query.pillar;
    if (query.storyAngle) filter.storyAngle = query.storyAngle;

    const [items, total] = await Promise.all([
      XPostModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .exec(),
      XPostModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((item) => XPostModel.serialize(item)),
      total,
    };
  }

  async getById(id: string) {
    const xPost = await XPostModel.findById(id).exec();

    if (!xPost) {
      throw new NotFoundException(`X post ${id} not found`);
    }

    return XPostModel.serialize(xPost);
  }

  async update(id: string, dto: UpdateXPostDto) {
    const update: Record<string, unknown> = { ...dto };

    if (dto.status === XPostStatus.Published) {
      update.publishedAt = new Date();
    }

    const xPost = await XPostModel.findByIdAndUpdate(id, update, {
      new: true,
    }).exec();

    if (!xPost) {
      throw new NotFoundException(`X post ${id} not found`);
    }

    return XPostModel.serialize(xPost);
  }

  async remove(id: string) {
    const xPost = await XPostModel.findByIdAndDelete(id).exec();

    if (!xPost) {
      throw new NotFoundException(`X post ${id} not found`);
    }

    return { success: true };
  }
}
