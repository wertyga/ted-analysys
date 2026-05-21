import {
  ConflictException,
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import { CurrencySign } from '@/resources/codelist';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { UserDocument } from '@/resources/user/user.types';
import {
  companyCpvPopulateFields,
  getEnumArray,
  getEnumOrNull,
  getNullableNumber,
  getSafeErrorMessage,
  getString,
  getStringArray,
  DebouncedAsyncLatestQueueByKey,
  isPopulatedRecord,
  isRecord,
  logger,
  sleep,
} from '@/utils';
import {
  CompanyTenderFilterCpvMatchLevel,
  CompanyTenderFilterCpvSource,
  CompanyTenderFilterDocument,
  CompanyTenderFilterGenerationStatus,
  CompanyTenderFilterModel,
} from './company-filter.schema';
import { UserModel } from '@/resources/user/user.schema';
import { COMPANY_TENDER_FILTER_SYSTEM_PROMPT } from './company-filter.prompt';
import { TenderMatchingService } from '@/resources/tender-matching/tender-matching.service';
import { CpvCategoryModel } from '@/resources/cpv/schemas';

const COMPANY_FILTER_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const COMPANY_FILTER_WAIT_INTERVAL_MS = 1000;
const COMPANY_FILTER_GENERATION_DEBOUNCE_MS = 5 * 1000;
const COMPANY_FILTER_GENERATION_CONCURRENCY = 5;

interface CompanyFilterCpvPayload {
  name?: string;
  code?: string;
}

interface CompanyTenderFilterAiPayload {
  companyName?: string;
  country?: string;
  operatingCountries: string[];
  companySize?: number;
  companyDescription?: string;
  industries: CompanyFilterCpvPayload[];
  mainServices: CompanyFilterCpvPayload[];
  languages: string[];
  certifications?: string[];
  capabilities?: string[];
  yearsOfExperience?: number;
  publicProcurementExperience?: boolean;
  typicalContractSize?: {
    min?: number;
    max?: number;
    currency?: CurrencySign;
  };
  minDaysBeforeDeadline: number;
}

interface CompanyTenderFilterAiResult {
  summary: string;
  targetCountries: string[];
  languages: string[];
  contractNatures: TedContractNature[];
  minBudget: number | null;
  maxBudget: number | null;
  currency: CurrencySign | null;
  allowUnknownBudget: boolean;
  minDaysBeforeDeadline: number;
  requiredKeywords: string[];
  optionalKeywords: string[];
  excludedKeywords: string[];
  certifications: string[];
  capabilities: string[];
  publicProcurementExperience: boolean | null;
  notificationThreshold: number;
  additionalCpvSuggestions: Array<{
    code: string;
    label: string;
    confidence: number;
    reason: string;
  }>;
  extractionWarnings: string[];
}

interface CompanyFilterGenerationInput {
  populatedUser: UserDocument;
  companyAnalysisId: CompanyTenderFilterDocument['_id'];
  sourceHash: string;
}

@Injectable()
export class CompanyFilterService {
  private readonly companyFilterGenerations: DebouncedAsyncLatestQueueByKey<
    string,
    CompanyFilterGenerationInput,
    void
  >;

  constructor(
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
    private readonly tenderMatchingService: TenderMatchingService,
  ) {
    this.companyFilterGenerations = new DebouncedAsyncLatestQueueByKey({
      delayMs: COMPANY_FILTER_GENERATION_DEBOUNCE_MS,
      concurrency: COMPANY_FILTER_GENERATION_CONCURRENCY,
      runner: (input) => this.runCompanyFilterGeneration(input),
    });
  }

  async generateAnalysisForCompany(
    user: UserDocument,
    isForceUpdate?: boolean,
  ): Promise<CompanyTenderFilterDocument> {
    const populatedUser = await this.getPopulatedUser(user);

    const { shouldBeUpdated, companyAnalysis } =
      await this.upsertCompanyAnalysisAsyncIfNeeded(
        populatedUser,
        isForceUpdate,
      );

    if (shouldBeUpdated || isForceUpdate) {
      this.companyFilterGenerations
        .run(String(populatedUser._id), {
          populatedUser,
          companyAnalysisId: companyAnalysis._id,
          sourceHash: companyAnalysis.sourceHash,
        })
        .catch((error: unknown) =>
          this.markGenerationFailed(populatedUser, error),
        );
    }

    return companyAnalysis;
  }

  async getFinishedCompanyAnalysis(
    user: UserDocument,
  ): Promise<CompanyTenderFilterDocument> {
    let companyAnalysis = await this.generateAnalysisForCompany(user);
    const waitUntil = Date.now() + COMPANY_FILTER_WAIT_TIMEOUT_MS;

    while (
      companyAnalysis.generationStatus !==
        CompanyTenderFilterGenerationStatus.COMPLETED &&
      companyAnalysis.generationStatus !==
        CompanyTenderFilterGenerationStatus.FAILED
    ) {
      if (Date.now() >= waitUntil) {
        throw new RequestTimeoutException(
          'Company tender filter analysis was not finished within 10 minutes',
        );
      }

      companyAnalysis = (await CompanyTenderFilterModel.findById(
        companyAnalysis._id,
      )
        .orFail()
        .exec()) as CompanyTenderFilterDocument;

      await sleep(COMPANY_FILTER_WAIT_INTERVAL_MS);
    }

    if (
      companyAnalysis.generationStatus ===
      CompanyTenderFilterGenerationStatus.FAILED
    ) {
      throw new Error(
        `Company tender filter analysis failed: ${
          companyAnalysis.generationError ?? 'unknown error'
        }`,
      );
    }

    return companyAnalysis;
  }

  async upsertCompanyAnalysisAsyncIfNeeded(
    user: UserDocument,
    isForceUpdate?: boolean,
  ): Promise<{
    companyAnalysis: CompanyTenderFilterDocument;
    shouldBeUpdated: boolean;
  }> {
    const existing = await CompanyTenderFilterModel.findOne({ user: user._id });
    const currentHash = this.calculateHash(user);

    const areHashEquals = existing && existing.sourceHash === currentHash;
    const saveStatus =
      existing?.generationStatus ===
        CompanyTenderFilterGenerationStatus.COMPLETED ||
      existing?.generationStatus ===
        CompanyTenderFilterGenerationStatus.IN_PROGRESS;

    if (areHashEquals && saveStatus && !isForceUpdate) {
      return { companyAnalysis: existing, shouldBeUpdated: false };
    }

    const analysis = await CompanyTenderFilterModel.findOneAndUpdate(
      {
        user: user._id,
      },
      {
        $set: {
          confirmedByUser: true,
          generationStatus: CompanyTenderFilterGenerationStatus.IN_PROGRESS,
          generationStartedAt: new Date(),
          generationFinishedAt: null,
          generationError: null,
          sourceHash: currentHash,
        },
        $setOnInsert: {
          user: user._id,
        },
      },
      { returnDocument: 'after', upsert: true },
    );

    return { companyAnalysis: analysis, shouldBeUpdated: true };
  }

  calculateHash(user: UserDocument): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          companyName: user.companyName,
          country: user.country,
          operatingCountries: user.operatingCountries ?? [],
          companySize: user.companySize,
          companyDescription: user.companyDescription,
          industries: normalizeCpvForHash(user.industries),
          mainServices: normalizeCpvForHash(user.mainServices),
          languages: user.languages ?? [],
          certifications: user.certifications ?? [],
          capabilities: user.capabilities ?? [],
          yearsOfExperience: user.yearsOfExperience,
          publicProcurementExperience: user.publicProcurementExperience,
          typicalContractSize: user.typicalContractSize
            ? {
                min: user.typicalContractSize.min,
                max: user.typicalContractSize.max,
                currency: user.typicalContractSize.currency,
              }
            : undefined,
          minDaysBeforeDeadline: user.minDaysBeforeDeadline,
        }),
      )
      .digest('hex');
  }

  private async markGenerationFailed(
    user: UserDocument,
    error: unknown,
  ): Promise<void> {
    await CompanyTenderFilterModel.updateOne(
      { user: user._id },
      {
        $set: {
          generationStatus: CompanyTenderFilterGenerationStatus.FAILED,
          generationFinishedAt: new Date(),
          generationError: getSafeErrorMessage(error),
        },
      },
    ).exec();
  }

  private async getPopulatedUser(user: UserDocument): Promise<UserDocument> {
    return UserModel.findById(user._id)
      .populate(companyCpvPopulateFields)
      .orFail()
      .exec();
  }

  private async analyzeCompanyProfile(
    payload: CompanyTenderFilterAiPayload,
  ): Promise<CompanyTenderFilterAiResult> {
    const response =
      await this.deepSeekAnalysisService.createGeneralJsonResponse(
        COMPANY_TENDER_FILTER_SYSTEM_PROMPT,
        this.buildUserPrompt(payload),
      );

    return this.validateAiResult(response, payload);
  }

  private async runCompanyFilterGeneration({
    populatedUser,
    companyAnalysisId,
    sourceHash,
  }: CompanyFilterGenerationInput): Promise<void> {
    const payload = this.buildCompanyProfilePayload(populatedUser);

    const result = await this.analyzeCompanyProfile(payload);

    const cpvCodes = await this.buildCompanyTenderFilterCpvCodes(
      populatedUser,
      result.additionalCpvSuggestions,
    );

    const updatedFilter = await CompanyTenderFilterModel.findOneAndUpdate(
      {
        _id: companyAnalysisId,
        sourceHash,
      },
      {
        $set: {
          summary: result.summary,
          cpvCodes,
          targetCountries: result.targetCountries,
          excludedCountries: [],
          languages: result.languages,
          contractNatures: result.contractNatures,
          minBudget: result.minBudget,
          maxBudget: result.maxBudget,
          currency: result.currency,
          minDaysBeforeDeadline: result.minDaysBeforeDeadline,
          requiredKeywords: result.requiredKeywords,
          optionalKeywords: result.optionalKeywords,
          excludedKeywords: result.excludedKeywords,
          certifications: result.certifications,
          capabilities: result.capabilities,
          publicProcurementExperience: result.publicProcurementExperience,
          notificationThreshold: result.notificationThreshold,
          confirmedByUser: true,
          generationStatus: CompanyTenderFilterGenerationStatus.COMPLETED,
          generationFinishedAt: new Date(),
          generationError: null,
          extractionWarnings: result.extractionWarnings,
        },
      },
      { returnDocument: 'after' },
    ).exec();

    if (!updatedFilter) {
      return;
    }

    this.tenderMatchingService
      .rematchActiveCompetitionTendersAfterCompanyProfileUpdated(updatedFilter)
      .catch((error: unknown) =>
        logger.info('TENDER_MATCHING_PROFILE_UPDATE_FAILED', {
          companyId: String(populatedUser._id),
          error: getSafeErrorMessage(error),
        }),
      );
  }

  private buildUserPrompt(payload: CompanyTenderFilterAiPayload): string {
    return [
      'Extract structured tender notification helper filters from this company profile.',
      '',
      'Company profile:',
      JSON.stringify(payload, null, 2),
      '',
      'Return JSON with this exact structure:',
      JSON.stringify(
        {
          summary: 'string',
          targetCountries: 'copy from user.operatingCountries only',
          languages: 'copy from user.languages only',
          contractNatures: ['services'],
          minBudget: null,
          maxBudget: null,
          currency: null,
          allowUnknownBudget: this.getAllowUnknownBudgetFromBudget(
            payload.typicalContractSize?.min,
            payload.typicalContractSize?.max,
          ),
          minDaysBeforeDeadline: null,
          requiredKeywords: [],
          optionalKeywords: ['string'],
          excludedKeywords: ['string'],
          certifications: 'copy from user.certifications only',
          capabilities: 'copy from user.capabilities only',
          publicProcurementExperience: null,
          notificationThreshold: 65,
          additionalCpvSuggestions: [
            {
              code: '8-digit CPV code not already present in industries/mainServices',
              label: 'string',
              confidence: 80,
              reason: 'string',
            },
          ],
          extractionWarnings: ['string'],
        },
        null,
        2,
      ),
    ].join('\n');
  }

  private buildCompanyProfilePayload(
    user: UserDocument,
  ): CompanyTenderFilterAiPayload {
    return {
      companyName: user.companyName,
      country: user.country,
      operatingCountries: user.operatingCountries ?? [],
      companySize: user.companySize,
      companyDescription: user.companyDescription,
      industries: user.industries as any,
      mainServices: user.mainServices as any,
      languages: Array.isArray(user.languages) ? user.languages : [],
      certifications: user.certifications,
      capabilities: user.capabilities,
      yearsOfExperience: user.yearsOfExperience,
      publicProcurementExperience: user.publicProcurementExperience,
      typicalContractSize: user.typicalContractSize,
      minDaysBeforeDeadline: user.minDaysBeforeDeadline,
    };
  }

  private validateAiResult(
    value: unknown,
    payload: CompanyTenderFilterAiPayload,
  ): CompanyTenderFilterAiResult {
    if (!isRecord(value)) {
      throw new Error(
        'Company tender filter analysis result must be an object',
      );
    }

    const minBudget =
      payload.typicalContractSize?.min === undefined
        ? null
        : getNullableNumber(value.minBudget);
    const maxBudget =
      payload.typicalContractSize?.max === undefined
        ? null
        : getNullableNumber(value.maxBudget);
    const currency =
      payload.typicalContractSize?.currency === undefined
        ? null
        : getEnumOrNull(value.currency, CurrencySign);
    const allowUnknownBudget = this.getAllowUnknownBudgetFromBudget(
      minBudget,
      maxBudget,
    );

    return {
      summary: getString(value, 'summary'),
      targetCountries: payload.operatingCountries,
      languages: payload.languages,
      contractNatures: getEnumArray(value.contractNatures, TedContractNature),
      minBudget,
      maxBudget,
      currency,
      allowUnknownBudget,
      minDaysBeforeDeadline: payload.minDaysBeforeDeadline,
      requiredKeywords: getStringArray(value, 'requiredKeywords'),
      optionalKeywords: getStringArray(value, 'optionalKeywords'),
      excludedKeywords: getStringArray(value, 'excludedKeywords'),
      certifications: payload.certifications ?? [],
      capabilities: payload.capabilities ?? [],
      publicProcurementExperience: payload.publicProcurementExperience ?? null,
      notificationThreshold: this.getScore(value, 'notificationThreshold', 65),
      additionalCpvSuggestions: this.getCpvSuggestions(
        value.additionalCpvSuggestions,
      ),
      extractionWarnings: getStringArray(value, 'extractionWarnings'),
    };
  }

  private getScore(
    record: Record<string, unknown>,
    key: string,
    fallback: number,
  ): number {
    const value = record[key];

    if (typeof value !== 'number' || value < 0 || value > 100) {
      return fallback;
    }

    return value;
  }

  private getAllowUnknownBudgetFromBudget(
    minBudget: number | null | undefined,
    maxBudget: number | null | undefined,
  ): boolean {
    return !minBudget && !maxBudget;
  }

  private async buildCompanyTenderFilterCpvCodes(
    user: UserDocument,
    suggestions: CompanyTenderFilterAiResult['additionalCpvSuggestions'],
  ): Promise<CompanyTenderFilterDocument['cpvCodes']> {
    const seenCodes = new Set<string>();
    const cpvCodes: CompanyTenderFilterDocument['cpvCodes'] = [];

    const addUserCpvCodes = (
      values: unknown,
      source:
        | CompanyTenderFilterCpvSource.INDUSTRY
        | CompanyTenderFilterCpvSource.MAIN_SERVICE,
    ) => {
      if (!Array.isArray(values)) {
        return;
      }

      values.forEach((value) => {
        if (!isPopulatedRecord(value)) {
          return;
        }

        const code = typeof value.code === 'string' ? value.code.trim() : '';

        if (!code || seenCodes.has(code)) {
          return;
        }

        seenCodes.add(code);
        cpvCodes.push({
          category: value._id as any,
          code,
          label: typeof value.name === 'string' ? value.name : '',
          source,
          matchLevel:
            source === CompanyTenderFilterCpvSource.INDUSTRY
              ? CompanyTenderFilterCpvMatchLevel.BROAD
              : CompanyTenderFilterCpvMatchLevel.SPECIFIC,
          confidence: 100,
          reason:
            source === CompanyTenderFilterCpvSource.INDUSTRY
              ? 'Selected in company industries'
              : 'Selected in company main services',
        });
      });
    };

    addUserCpvCodes(user.industries, CompanyTenderFilterCpvSource.INDUSTRY);
    addUserCpvCodes(
      user.mainServices,
      CompanyTenderFilterCpvSource.MAIN_SERVICE,
    );

    const newSuggestionCodes = suggestions
      .map((suggestion) => suggestion.code)
      .filter((code) => !seenCodes.has(code));
    const suggestionCategories = await CpvCategoryModel.find({
      code: { $in: newSuggestionCodes },
    })
      .select('code')
      .exec();
    const suggestionCategoryByCode = new Map(
      suggestionCategories.map((category) => [category.code, category._id]),
    );

    suggestions.forEach((suggestion) => {
      if (seenCodes.has(suggestion.code)) {
        return;
      }

      seenCodes.add(suggestion.code);
      cpvCodes.push({
        category: suggestionCategoryByCode.get(suggestion.code) ?? null,
        code: suggestion.code,
        label: suggestion.label,
        source: CompanyTenderFilterCpvSource.AI_SUGGESTION,
        matchLevel: CompanyTenderFilterCpvMatchLevel.MEDIUM,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
      });
    });

    return cpvCodes;
  }

  private getCpvSuggestions(
    value: unknown,
  ): CompanyTenderFilterAiResult['additionalCpvSuggestions'] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      if (!isRecord(item)) return [];

      const code = getString(item, 'code').trim();
      const label = getString(item, 'label').trim();

      if (!code || !label) return [];

      return {
        code,
        label,
        confidence: this.getConfidence(item.confidence),
        reason: getString(item, 'reason'),
      };
    });
  }

  private getConfidence(value: unknown): number {
    if (typeof value !== 'number') {
      return 0;
    }

    return Math.min(100, Math.max(0, value));
  }
}

function normalizeCpvForHash(values: unknown): unknown[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((item: any) => {
    return {
      code: item.code,
    };
  });
}
