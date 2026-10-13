import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import { CpvService } from '@/resources/cpv/cpv.service';
import { isDuplicateKeyError, QueueAsyncConcurrency } from '@/utils';
import { hasProAccess } from '@/guards';
import { USER_TYPE, UserDocument } from '@/resources/user/user.types';
import { normalizeCompanyProfileAiResult } from '@/resources/company-profile-documents/company-profile.normalizer';
import { COMPANY_PROFILE_WEBSITE_CONFIG } from '@/config/company-profile-website.config';
import {
  CompanyWebsiteFetchError,
  crawlCompanyWebsite,
} from './company-website-crawler';
import { COMPANY_PROFILE_WEBSITE_SYSTEM_PROMPT } from './company-profile-website.prompt';
import {
  CompanyProfileWebsiteExtractResult,
  CompanyProfileWebsiteUsage,
  CompanyWebsiteCrawlResult,
} from './company-profile-website.types';
import {
  CompanyProfileWebsiteExtractionDocument,
  CompanyProfileWebsiteExtractionModel,
  CompanyProfileWebsiteExtractionStatus,
} from './schemas';

/** Extractions allowed without a Pro tariff (enforced by a unique index). */
const FREE_EXTRACTIONS_LIMIT = 1;

@Injectable()
export class CompanyProfileWebsiteService {
  private readonly analysisQueue = new QueueAsyncConcurrency(
    COMPANY_PROFILE_WEBSITE_CONFIG.analysis.concurrency,
  );

  constructor(
    private readonly llmAnalysisService: LlmAnalysisService,
    private readonly cpvService: CpvService,
  ) {}

  async getUsage(user: UserDocument): Promise<CompanyProfileWebsiteUsage> {
    if (await hasProAccess(user)) {
      return {
        unlimited: true,
        freeLimit: FREE_EXTRACTIONS_LIMIT,
        remaining: null,
      };
    }

    const used = await CompanyProfileWebsiteExtractionModel.countDocuments({
      user: user._id,
      free: true,
    });

    return {
      unlimited: false,
      freeLimit: FREE_EXTRACTIONS_LIMIT,
      remaining: Math.max(0, FREE_EXTRACTIONS_LIMIT - used),
    };
  }

  /**
   * Builds a company profile draft from the company website. Nothing is
   * saved: the user reviews the draft and saves it through the regular
   * profile update.
   *
   * Without a Pro tariff only one extraction is allowed. A run that fails
   * (bad URL, unreadable site, AI error) is not counted.
   */
  async extractProfile(
    url: string,
    user: UserDocument,
  ): Promise<CompanyProfileWebsiteExtractResult> {
    const run = await this.startRun(url, user);

    try {
      const result = await this.extractProfileFromWebsite(url);

      await CompanyProfileWebsiteExtractionModel.updateOne(
        { _id: run._id },
        { $set: { status: CompanyProfileWebsiteExtractionStatus.DONE } },
      ).exec();

      return result;
    } catch (error: unknown) {
      await CompanyProfileWebsiteExtractionModel.deleteOne({
        _id: run._id,
      }).exec();

      throw error;
    }
  }

  private async startRun(
    url: string,
    user: UserDocument,
  ): Promise<CompanyProfileWebsiteExtractionDocument> {
    if (await hasProAccess(user)) {
      return CompanyProfileWebsiteExtractionModel.create({
        user: user._id,
        url,
        free: false,
      });
    }

    if (user.status === USER_TYPE.TEMPORARY) {
      throw new ForbiddenException(
        'Confirm your email to extract a company profile from a website',
      );
    }

    try {
      return await CompanyProfileWebsiteExtractionModel.create({
        user: user._id,
        url,
        free: true,
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    // A free run left PROCESSING by a crashed server must not lock the user
    // out: take it over once it is stale.
    const staleRun =
      await CompanyProfileWebsiteExtractionModel.findOneAndUpdate(
        {
          user: user._id,
          free: true,
          status: CompanyProfileWebsiteExtractionStatus.PROCESSING,
          updatedAt: {
            $lt: new Date(
              Date.now() - COMPANY_PROFILE_WEBSITE_CONFIG.analysis.staleRunMs,
            ),
          },
        },
        { $set: { url } },
        { returnDocument: 'after', timestamps: true },
      ).exec();

    if (staleRun) {
      return staleRun;
    }

    throw new ForbiddenException({
      code: 'COMPANY_WEBSITE_EXTRACTION_LIMIT_REACHED',
      message:
        'The free website profile extraction has already been used. Upgrade to Pro for unlimited extractions.',
    });
  }

  private async extractProfileFromWebsite(
    url: string,
  ): Promise<CompanyProfileWebsiteExtractResult> {
    const crawl = await this.crawl(url);
    const totalChars = crawl.pages.reduce(
      (sum, page) => sum + page.text.length,
      0,
    );

    if (totalChars < COMPANY_PROFILE_WEBSITE_CONFIG.context.minTotalChars) {
      throw new UnprocessableEntityException(
        'Could not read enough content from the website. It may be rendered with JavaScript only or be empty.',
      );
    }

    const aiResult = await this.analysisQueue.push(() =>
      this.llmAnalysisService.createGeneralJsonResponse(
        COMPANY_PROFILE_WEBSITE_SYSTEM_PROMPT,
        this.buildContext(crawl),
      ),
    );

    const profile = normalizeCompanyProfileAiResult(aiResult);

    const [industries, mainServices] = await Promise.all([
      this.cpvService.resolveCpvCodeIds(profile.industries ?? [], true),
      this.cpvService.resolveCpvCodeIds(profile.mainServices ?? [], true),
    ]);

    return {
      resolvedProfile: {
        ...profile,
        industries: industries.map(({ code }) => code),
        mainServices: mainServices.map(({ code }) => code),
      },
      website: {
        url: crawl.startUrl,
        pages: crawl.pages.map((page) => ({
          url: page.url,
          title: page.title,
          contentLength: page.text.length,
        })),
        warnings: crawl.warnings,
      },
    };
  }

  private async crawl(url: string): Promise<CompanyWebsiteCrawlResult> {
    try {
      return await crawlCompanyWebsite(url);
    } catch (error: unknown) {
      if (error instanceof CompanyWebsiteFetchError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  private buildContext(crawl: CompanyWebsiteCrawlResult): string {
    const siteLanguages = Array.from(
      new Set(
        crawl.pages.flatMap((page) => [
          ...(page.lang ? [page.lang] : []),
          ...page.hreflangs,
        ]),
      ),
    );

    const header = [
      `Website: ${crawl.startUrl}`,
      `Current year: ${new Date().getFullYear()}`,
      `Site languages: ${siteLanguages.join(', ') || 'unknown'}`,
    ].join('\n');

    const pages = crawl.pages.map((page, index) => {
      const meta = [
        `Page ${index + 1}: ${page.url}`,
        page.title && `Title: ${page.title}`,
        page.description && `Meta description: ${page.description}`,
        page.jsonLd && `Structured data (JSON-LD):\n${page.jsonLd}`,
      ].filter(Boolean);

      return `${meta.join('\n')}\n\n${page.text}`;
    });

    return [header, ...pages]
      .join('\n\n---\n\n')
      .slice(0, COMPANY_PROFILE_WEBSITE_CONFIG.context.maxChars);
  }
}
