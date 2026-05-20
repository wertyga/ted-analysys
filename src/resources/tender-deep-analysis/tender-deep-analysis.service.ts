import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import {
  companyCpvPopulateFields,
  deepAnalysisPopulateFields,
  devLog,
  getPaginationMeta,
  getSafeErrorMessage,
  isDuplicateKeyError,
  logger,
  QueueAsyncConcurrency,
  tenderCpvPopulateFields,
} from '@/utils';
import { UserModel } from '../user/user.schema';
import { TenderDocument, TenderModel } from '../tenders/schemas';
import {
  TenderGeneralAnalysis,
  TenderGeneralAnalysisDocument,
  TenderGeneralAnalysisRecord,
} from '../tender-analysis/schemas';
import {
  TenderDeepAnalysisDocument,
  TenderDeepAnalysisModel,
  TenderDeepAnalysisRecord,
  TenderDeepAnalysisStatus,
} from './schemas';
import { TenderGeneralAnalysisService } from '../tender-analysis/tender-general-analysis.service';
import { TenderDeepAnalysisBuilder } from './tender-deep-analysis.builder';
import { TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION } from '@/openai/prompts/tender-deep-company-fit.prompt';
import { TenderDeepDocumentInputService } from './tender-deep-document-input.service';
import { CompanyTenderFilterModel } from '@/resources/company-filter/company-filter.schema';
import { CompanyFilterService } from '@/resources/company-filter/company-filter.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { QueryFilter } from 'mongoose';
import { AiFitDecision } from '@/resources/tender-matching/tender-match.types';

const TENDER_DEEP_COMPANY_FIT_ANALYSIS_CONCURRENCY = 2;

@Injectable()
export class TenderDeepAnalysisService {
  private readonly deepCompanyFitAnalysisQueue = new QueueAsyncConcurrency(
    TENDER_DEEP_COMPANY_FIT_ANALYSIS_CONCURRENCY,
  );

  constructor(
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
    private readonly deepAnalysisBuilder: TenderDeepAnalysisBuilder,
    private readonly deepDocumentInputService: TenderDeepDocumentInputService,
    private readonly tendersService: TendersService,
    private readonly companyFilterService: CompanyFilterService,
    @Inject(forwardRef(() => TenderGeneralAnalysisService))
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  async createDeepAnalysis({
    tenderId,
    companyId,
    outputLanguage,
    localDeepAnalysis,
  }: {
    tenderId: string;
    companyId: string;
    outputLanguage?: string;
    localDeepAnalysis: TenderDeepAnalysisDocument;
  }): Promise<void> {
    const language = normalizeDeepAnalysisLanguage(outputLanguage);

    await this.logDeepAnalysisEvent('TENDER_DEEP_ANALYSIS_STARTED', {
      companyId,
      tenderId,
      outputLanguage: language,
      deepAnalysisId: String(localDeepAnalysis._id),
      purpose: 'Create deep company-fit tender analysis',
    });

    try {
      const [tender, company] = await Promise.all([
        TenderModel.findOne({ id: tenderId }).populate(tenderCpvPopulateFields),
        UserModel.findById(companyId).populate(companyCpvPopulateFields),
      ]);

      if (!tender) {
        throw new Error('Tender not found');
      }
      if (!company) {
        throw new Error('Company not found');
      }

      const [generalAnalysis, companyAnalysis] = await Promise.all([
        this.tenderGeneralAnalysisService.getFinishedGeneralAnalysis(tender),
        this.companyFilterService.getFinishedCompanyAnalysis(company),
      ]);

      const companyDto =
        this.deepAnalysisBuilder.buildCompanyAnalysisDto(company);

      const documentsInput =
        await this.deepDocumentInputService.buildDeepDocumentInput(tender);

      const input = this.deepAnalysisBuilder.buildInput({
        tender,
        generalAnalysis,
        company: companyDto,
        companyAnalysis,
        documentAnalyses: documentsInput.documentAnalyses,
        documentTextSnippets: documentsInput.documentTextSnippets,
        outputLanguage: language,
      });
      // throw new Error('TEST ERROR');
      const rawResult = await this.deepCompanyFitAnalysisQueue.push(() =>
        this.deepSeekAnalysisService.analyzeTenderDeepCompanyFit(input),
      );

      const normalized = this.deepAnalysisBuilder.normalizeResult(
        rawResult,
        input,
      );

      await localDeepAnalysis.updateOne({
        $set: {
          status: TenderDeepAnalysisStatus.COMPLETED,
          language,
          resultJson: normalized,
          executiveSummary: normalized.executiveSummary,
          fitScore: normalized.scores.fitScore,
          fitConfidenceScore: normalized.scores.fitConfidenceScore,
          participationReadinessScore:
            normalized.scores.participationReadinessScore,
          documentationCompletenessScore:
            normalized.scores.documentationCompletenessScore,
          requirementsClarityScore: normalized.scores.requirementsClarityScore,
          riskScore:
            normalized.scores.riskLevelScore ?? normalized.scores.riskScore,
          riskLevelScore: normalized.scores.riskLevelScore,
          riskFitScore: normalized.scores.riskFitScore,
          opportunityScore: normalized.scores.opportunityScore,
          companyCapabilityScore: normalized.scores.companyCapabilityScore,
          eligibilityFitScore: normalized.scores.eligibilityFitScore,
          commercialFitScore: normalized.scores.commercialFitScore,
          deadlineFitScore: normalized.scores.deadlineFitScore,
          recommendation: normalized.finalRecommendation.value,
          documentsAnalyzedCount:
            normalized.documentationAnalysis.documentsAnalyzedCount,
          documentsTotalCount:
            normalized.documentationAnalysis.documentsTotalCount,
          missingDocumentsWarning:
            normalized.documentationAnalysis.missingDocumentsWarning,
          model: this.deepSeekAnalysisService.getDeepAnalysisModel(),
          analyzedAt: new Date(),
        },
        $unset: { errorMessage: '' },
      });

      await this.logDeepAnalysisEvent('TENDER_DEEP_ANALYSIS_COMPLETED', {
        companyId,
        tenderId,
        outputLanguage: language,
        deepAnalysisId: String(localDeepAnalysis._id),
        fitScore: normalized.scores.fitScore,
        recommendation: normalized.finalRecommendation.value,
        purpose: 'Complete deep company-fit tender analysis',
      });
    } catch (error: unknown) {
      const errorMessage = getSafeErrorMessage(error);

      await this.markProcessingAnalysisFailed({
        error,
        companyId,
        sourceHash: localDeepAnalysis.sourceHash ?? '',
        tenderId,
      });

      await this.logDeepAnalysisEvent('TENDER_DEEP_ANALYSIS_FAILED', {
        companyId,
        tenderId,
        outputLanguage: language,
        deepAnalysisId: String(localDeepAnalysis._id),
        errorMessage,
        purpose: 'Create deep company-fit tender analysis',
      });
    }
  }

  async analyzeTenderDeepCompanyFit(params: {
    tenderId: string;
    companyId: string;
    language?: string;
  }): Promise<TenderDeepAnalysisDocument> {
    const language = normalizeDeepAnalysisLanguage(params.language);

    const [tender, company] = await Promise.all([
      this.tendersService.findByTedIdOrCreateIfNeeded(params.tenderId),
      UserModel.findById(params.companyId),
    ]);

    if (!tender) {
      throw new Error('Tender not found');
    }
    if (!company) {
      throw new Error('Company not found');
    }

    const [generalAnalysis, companyAnalysis] = await Promise.all([
      this.tenderGeneralAnalysisService.ensureAnalysisForTender(tender),
      this.companyFilterService.generateAnalysisForCompany(company),
    ]);

    const sourceHash = this.buildSourceHash({
      generalAnalysisSourceHash: generalAnalysis.sourceHash,
      companyAnalysisSourceHash: companyAnalysis.sourceHash,
      tenderSourceHash: tender.sourceHash,
      outputLanguage: language,
    });

    const { deepAnalysis: localDeepAnalysis, shouldStart } =
      await this.upsertProcessingAnalysisIfNeeded({
        tender,
        companyId: params.companyId,
        generalAnalysisId: generalAnalysis._id.toString(),
        language,
        sourceHash,
      });

    if (shouldStart) {
      this.createDeepAnalysis({
        tenderId: params.tenderId,
        companyId: params.companyId,
        outputLanguage: language,
        localDeepAnalysis,
      });
    }

    return localDeepAnalysis;
  }

  async getDeppAnalysisTender(params: {
    tenderId: string;
    companyId: string;
    language?: string;
  }): Promise<TenderDeepAnalysisRecord | null> {
    const language = normalizeDeepAnalysisLanguage(params.language);

    const query = {
      tenderId: params.tenderId,
      company: params.companyId,
    };

    if (language) {
      Object.assign(query, { language });
    }

    return TenderDeepAnalysisModel.findOne(query)
      .sort({ createdAt: -1 })
      .populate(deepAnalysisPopulateFields)
      .lean<TenderDeepAnalysisRecord>()
      .exec();
  }

  async listByCompany(params: {
    companyId: string;
    page?: number;
    limit?: number;
    tenderIds?: string[];
    language?: string;
  }): Promise<{
    analyses: TenderDeepAnalysisRecord[];
    total: number;
  }> {
    const query: QueryFilter<TenderDeepAnalysisDocument> = {
      company: params.companyId,
    };

    const { skip, limit } = getPaginationMeta({
      page: params.page,
      limit: params.limit,
    });

    if (params.tenderIds?.length) {
      query.tenderId = { $in: params.tenderIds };
    }

    if (params.language) {
      Object.assign(query, {
        language: params.language,
      });
    }

    devLog(`listByCompany: ${JSON.stringify(query)}`);

    const [deepAnalyses, totalDeepAnalysis, companyAnalysis] =
      await Promise.all([
        TenderDeepAnalysisModel.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate(deepAnalysisPopulateFields)
          .lean<TenderDeepAnalysisRecord[]>()
          .exec(),
        TenderDeepAnalysisModel.countDocuments(query).exec(),
        CompanyTenderFilterModel.findOne({ user: params.companyId }).exec(),
      ]);

    const analysesWithOutDate = deepAnalyses.map((deepAnalysis) => {
      const generalAnalysis = deepAnalysis.generalAnalysis as
        | TenderGeneralAnalysisDocument
        | TenderGeneralAnalysisRecord
        | undefined;
      const tender = deepAnalysis.tender as TenderDocument | undefined;

      if (
        !generalAnalysis?.sourceHash ||
        !companyAnalysis?.sourceHash ||
        !tender?.sourceHash
      ) {
        return {
          ...deepAnalysis,
          isOutOfDate: false,
        };
      }

      const currentSourceHash = this.buildSourceHash({
        generalAnalysisSourceHash: generalAnalysis.sourceHash,
        companyAnalysisSourceHash: companyAnalysis.sourceHash,
        outputLanguage: getDeepAnalysisOutputLanguage(deepAnalysis),
        tenderSourceHash: tender.sourceHash,
      });

      return {
        ...deepAnalysis,
        isOutOfDate: deepAnalysis.sourceHash !== currentSourceHash,
      };
    });

    return { analyses: analysesWithOutDate, total: totalDeepAnalysis };
  }

  private async upsertProcessingAnalysisIfNeeded({
    tender,
    generalAnalysisId,
    language,
    sourceHash,
    companyId,
  }: {
    tender: TenderDocument;
    companyId: string;
    generalAnalysisId: string;
    language: string;
    sourceHash: string;
  }): Promise<{
    deepAnalysis: TenderDeepAnalysisDocument;
    shouldStart: boolean;
  }> {
    const deepAnalysis = await TenderDeepAnalysisModel.findOne({
      tenderId: tender.id,
      company: companyId,
      sourceHash,
    }).populate(deepAnalysisPopulateFields);

    const isNeedToUpdateOrCreateProcessing =
      !deepAnalysis || deepAnalysis.status === TenderDeepAnalysisStatus.FAILED;
    console.log({ deepAnalysis });
    if (isNeedToUpdateOrCreateProcessing) {
      const deepAnalysisInProcess =
        await TenderDeepAnalysisModel.findOneAndUpdate(
          {
            tenderId: tender.id,
            company: companyId,
            sourceHash,
          },
          {
            $set: {
              tender: tender._id,
              company: companyId,
              sourceHash,
              generalAnalysis: generalAnalysisId,
              language,
              status: TenderDeepAnalysisStatus.PROCESSING,
              promptVersion: TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION,
            },
            $unset: { errorMessage: '' },
          },
          { returnDocument: 'after', upsert: true },
        ).populate(deepAnalysisPopulateFields);

      return {
        deepAnalysis: deepAnalysisInProcess,
        shouldStart: true,
      };
    }

    return { deepAnalysis, shouldStart: false };
  }

  private async markProcessingAnalysisFailed({
    tenderId,
    companyId,
    sourceHash,
    error,
  }: {
    tenderId: string;
    companyId: string;
    sourceHash: string;
    error: unknown;
  }): Promise<void> {
    try {
      await TenderDeepAnalysisModel.updateOne(
        {
          tenderId,
          company: companyId,
          sourceHash,
        },
        {
          $set: {
            status: TenderDeepAnalysisStatus.FAILED,
            errorMessage: getSafeErrorMessage(error),
          },
        },
      ).exec();
    } catch {
      // Preserve the original error from the upsert path.
    }
  }

  private async logDeepAnalysisEvent(
    message: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await logger.info(message, data);
    } catch {
      // Logging must not affect analysis processing.
    }
  }

  buildSourceHash(input: {
    tenderSourceHash: string;
    generalAnalysisSourceHash: string;
    companyAnalysisSourceHash: string;
    outputLanguage?: string;
  }): string {
    const outputLanguage = normalizeDeepAnalysisLanguage(input.outputLanguage);

    return createHash('sha256')
      .update(
        JSON.stringify({
          model: this.deepSeekAnalysisService.getDeepAnalysisModel(),
          promptVersion: TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION,
          outputLanguage,
          generalAnalysisSourceHash: input.generalAnalysisSourceHash,
          companyAnalysisSourceHash: input.companyAnalysisSourceHash,
          tenderSourceHash: input.tenderSourceHash,
        }),
      )
      .digest('hex');
  }
}

function getDeepAnalysisOutputLanguage(
  analysis: TenderDeepAnalysisRecord,
): string | undefined {
  if (analysis.language) {
    return analysis.language;
  }

  const resultJson = analysis.resultJson as { language?: unknown } | undefined;

  return typeof resultJson?.language === 'string'
    ? resultJson.language
    : undefined;
}

function normalizeDeepAnalysisLanguage(language?: string): string {
  const normalized = language?.trim();

  return normalized && normalized.length > 0 ? normalized : 'en';
}
