import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import { CurrencySign } from '@/resources/codelist';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { UserDocument } from '@/resources/user/user.types';
import {
  companyCpvPopulateFields,
  getBoolean,
  getEnumArray,
  getEnumOrNull,
  getNullableNumber,
  getSafeErrorMessage,
  getString,
  getStringArray,
  isDuplicateKeyError,
  isRecord,
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
import { TenderCompanyMatchDocument } from '@/resources/tender-matching/schemas/tender-company-match.schema';

interface CompanyFilterCpvPayload {
  name?: string;
  code?: string;
}

interface CompanyTenderFilterAiPayload {
  companyName?: string;
  country?: string;
  operatingRegions: string[];
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

@Injectable()
export class CompanyFilterService {
  constructor(
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
    private readonly tenderMatchingService: TenderMatchingService,
  ) {}

  async handleCompanyUpdated(user: UserDocument): Promise<{
    filter: CompanyTenderFilterDocument;
    matches: TenderCompanyMatchDocument[];
  }> {
    let filter: CompanyTenderFilterDocument;

    try {
      filter = await this.generateAnalysisForCompany(user);
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        const existingFilter = await CompanyTenderFilterModel.findOne({
          user: user._id,
        })
          .orFail()
          .exec();

        return { filter: existingFilter, matches: [] };
      }

      throw error;
    }

    return { filter, matches: [] };
  }

  async confirmCompanyTenderFilter(user: UserDocument): Promise<{
    filter: CompanyTenderFilterDocument;
    matches: TenderCompanyMatchDocument[];
  }> {
    const filter = await CompanyTenderFilterModel.findOneAndUpdate(
      {
        user: user._id,
        generationStatus: CompanyTenderFilterGenerationStatus.COMPLETED,
      },
      {
        $set: {
          confirmedByUser: true,
        },
      },
      { returnDocument: 'after' },
    ).exec();

    if (!filter) {
      throw new NotFoundException(
        'Completed company tender filter for current user not found',
      );
    }

    const matches =
      await this.tenderMatchingService.matchActiveRecentTendersWithCompanyFilter(
        filter,
      );

    return { filter, matches };
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
      const payload = this.buildCompanyProfilePayload(populatedUser);

      try {
        this.analyzeCompanyProfile(payload).then((result) => {
          return CompanyTenderFilterModel.findByIdAndUpdate(
            companyAnalysis._id,
            {
              $set: {
                summary: result.summary,
                cpvCodes: result.additionalCpvSuggestions.map((suggestion) => ({
                  code: suggestion.code,
                  label: suggestion.label,
                  source: CompanyTenderFilterCpvSource.AI_SUGGESTION,
                  matchLevel: CompanyTenderFilterCpvMatchLevel.MEDIUM,
                  confidence: suggestion.confidence,
                  reason: suggestion.reason,
                })),
                targetCountries: result.targetCountries,
                excludedCountries: [],
                languages: result.languages,
                contractNatures: result.contractNatures,
                minBudget: result.minBudget,
                maxBudget: result.maxBudget,
                currency: result.currency,
                allowUnknownBudget: result.allowUnknownBudget,
                minDaysBeforeDeadline: result.minDaysBeforeDeadline,
                requiredKeywords: result.requiredKeywords,
                optionalKeywords: result.optionalKeywords,
                excludedKeywords: result.excludedKeywords,
                certifications: result.certifications,
                capabilities: result.capabilities,
                publicProcurementExperience: result.publicProcurementExperience,
                notificationThreshold: result.notificationThreshold,
                confirmedByUser: false,
                generationStatus: CompanyTenderFilterGenerationStatus.COMPLETED,
                generationFinishedAt: new Date(),
                generationError: null,
                extractionWarnings: result.extractionWarnings,
              },
            },
            { returnDocument: 'after' },
          )
            .orFail()
            .exec();
        });
      } catch (error: unknown) {
        await this.markGenerationFailed(populatedUser, error);
      }
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

    if (
      existing &&
      existing.sourceHash === currentHash &&
      existing.generationStatus ===
        CompanyTenderFilterGenerationStatus.COMPLETED &&
      !isForceUpdate
    ) {
      return { companyAnalysis: existing, shouldBeUpdated: false };
    }

    if (
      existing &&
      existing.sourceHash === currentHash &&
      existing.generationStatus ===
        CompanyTenderFilterGenerationStatus.IN_PROGRESS &&
      !isForceUpdate
    ) {
      return { companyAnalysis: existing, shouldBeUpdated: false };
    }

    const analysis = await CompanyTenderFilterModel.findOneAndUpdate(
      {
        user: user._id,
      },
      {
        $set: {
          confirmedByUser: false,
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
    const response = await this.deepSeekAnalysisService.createDeepJsonResponse(
      COMPANY_TENDER_FILTER_SYSTEM_PROMPT,
      this.buildUserPrompt(payload),
    );

    return this.validateAiResult(response, payload);
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
          targetCountries: 'user.operatingCountries',
          languages: 'user.languages',
          contractNatures: Object.values(TedContractNature),
          minBudget: null,
          maxBudget: null,
          currency: null,
          allowUnknownBudget: true,
          minDaysBeforeDeadline: 'user.minDaysBeforeDeadline',
          requiredKeywords: ['string'],
          optionalKeywords: ['string'],
          excludedKeywords: ['string'],
          certifications: ['string'],
          capabilities: ['string'],
          publicProcurementExperience: null,
          notificationThreshold: 65,
          additionalCpvSuggestions: [
            {
              code: 'string',
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
      operatingRegions: user.operatingCountries ?? [],
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

    return {
      summary: getString(value, 'summary'),
      targetCountries: payload.operatingRegions,
      languages: payload.languages,
      contractNatures: getEnumArray(value.contractNatures, TedContractNature),
      minBudget,
      maxBudget,
      currency,
      allowUnknownBudget: getBoolean(value, 'allowUnknownBudget', true),
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
