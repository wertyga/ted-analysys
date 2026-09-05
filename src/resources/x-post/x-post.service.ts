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
} from './schemas';
import { XPostImageService } from './image/x-post-image.service';
import { TENDERWIZE_ORIGIN, XPostDataService } from './x-post-data.service';

const NO_DATA_MESSAGE =
  'No matching real data was found for this topic. Try a broader or more specific topic (a different country, category, or value range).';

@Injectable()
export class XPostService {
  private readonly logger = new Logger(XPostService.name);
  private guidelinesCache?: string;
  private featuresCache?: string;

  constructor(
    private readonly llmAnalysisService: LlmAnalysisService,
    private readonly xPostImageService: XPostImageService,
    private readonly xPostDataService: XPostDataService,
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

    let result: GenerateXPostResult;
    let sourceIds: string[] = [];
    let sourceSummary: string | undefined;

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
        const execution = await this.xPostDataService.executeTool(name, args);

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

    const sanitizedPosts = this.sanitizePostUrls(result.posts, [
      TENDERWIZE_ORIGIN,
      clientUrl,
    ]);

    const storedTopic =
      dto.topic && dto.topic.trim()
        ? dto.topic.trim()
        : (sourceSummary || result.notes || 'Auto-selected by AI').slice(
            0,
            300,
          );

    const xPost = await XPostModel.create({
      topic: storedTopic,
      pillar: dto.pillar,
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
