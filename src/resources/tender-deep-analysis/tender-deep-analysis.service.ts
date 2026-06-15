import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import {
  companyCpvPopulateFields,
  deepAnalysisPopulateFields,
  devLog,
  getPaginationMeta,
  getSafeErrorMessage,
  logger,
  QueueAsyncConcurrency,
  tenderCpvPopulateFields,
  toRecord,
} from '@/utils';
import { UserModel } from '../user/user.schema';
import { TenderDocument, TenderModel } from '../tenders/schemas';
import {
  TenderDeepAnalysisDocument,
  TenderDeepAnalysisModel,
  TenderDeepAnalysisRecord,
  TenderDeepAnalysisStatus,
} from './schemas';
import { TenderGeneralAnalysisService } from '../tender-analysis/tender-general-analysis.service';
import { TenderDeepAnalysisBuilder } from './tender-deep-analysis.builder';
import { TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION } from '@/resources/tender-deep-analysis/tender-deep-company-fit.prompt';
import { TenderDeepDocumentInputService } from './tender-deep-document-input.service';
import { CompanyTenderFilterModel } from '@/resources/company-filter/company-filter.schema';
import { CompanyFilterService } from '@/resources/company-filter/company-filter.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { QueryFilter } from 'mongoose';
import {
  getCompanyAnalysisSourceHash,
  getGeneralAnalysisSourceHash,
  getTenderSourceHash,
  normalizeDeepAnalysisLanguage,
} from '@/resources/tender-deep-analysis/tender-deep-analysis.utils';
import { CompanyProfileDocumentsService } from '@/resources/company-profile-documents/company-profile-documents.service';
import { TENDER_DEEP_ANALYSIS_CONFIG } from '@/config/tender-deep-analysis.config';
import fs from 'node:fs';

@Injectable()
export class TenderDeepAnalysisService {
  private readonly deepCompanyFitAnalysisQueue = new QueueAsyncConcurrency(
    TENDER_DEEP_ANALYSIS_CONFIG.companyFitAnalysis.concurrency,
  );

  constructor(
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
    private readonly deepAnalysisBuilder: TenderDeepAnalysisBuilder,
    private readonly deepDocumentInputService: TenderDeepDocumentInputService,
    private readonly tendersService: TendersService,
    private readonly companyFilterService: CompanyFilterService,
    private readonly companyProfileDocumentsService: CompanyProfileDocumentsService,
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
        this.companyProfileDocumentsService.getFinishedCompanyDocumentsAnalysis(
          company,
        ),
      ]);

      const companyDocumentEvidence =
        await this.companyProfileDocumentsService.buildCompanyDocumentEvidence(
          String(company._id),
        );
      const companyDto = this.deepAnalysisBuilder.buildCompanyAnalysisDto(
        company,
        companyDocumentEvidence,
      );

      const tenderDocumentsInput =
        await this.deepDocumentInputService.buildDeepDocumentInput(tender);

      const input = this.deepAnalysisBuilder.buildInput({
        tender,
        generalAnalysis,
        company: companyDto,
        companyAnalysis,
        documentMetadata: tenderDocumentsInput.documentMetadata,
        documentTextSnippets: tenderDocumentsInput.documentTextSnippets,
        outputLanguage: language,
      });

      const rawResult = await this.deepCompanyFitAnalysisQueue.push(() =>
        this.deepSeekAnalysisService.analyzeTenderDeepCompanyFit(input),
      );

      const normalized = this.deepAnalysisBuilder.normalizeResult(
        rawResult,
        input,
      );

      await TenderDeepAnalysisModel.updateOne(
        {
          _id: localDeepAnalysis._id,
          sourceHash: localDeepAnalysis.sourceHash,
        },
        {
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
            requirementsClarityScore:
              normalized.scores.requirementsClarityScore,
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
        },
      ).exec();

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
    forceUpdate?: boolean;
  }): Promise<TenderDeepAnalysisDocument | TenderDeepAnalysisRecord> {
    const language = normalizeDeepAnalysisLanguage(params.language);

    const [tender, company] = await Promise.all([
      this.tendersService.findLocalTender(params.tenderId),
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
        forceUpdate: params.forceUpdate,
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

    const analysesWithOutDate = await Promise.all(
      deepAnalyses.map((deepAnalysis) =>
        this.withOutOfDateFlag(deepAnalysis, companyAnalysis),
      ),
    );

    return { analyses: analysesWithOutDate, total: totalDeepAnalysis };
  }

  private async upsertProcessingAnalysisIfNeeded({
    tender,
    generalAnalysisId,
    language,
    sourceHash,
    companyId,
    forceUpdate,
  }: {
    tender: TenderDocument;
    companyId: string;
    generalAnalysisId: string;
    language: string;
    sourceHash: string;
    forceUpdate?: boolean;
  }): Promise<{
    deepAnalysis: TenderDeepAnalysisDocument;
    shouldStart: boolean;
  }> {
    const deepAnalysis = await TenderDeepAnalysisModel.findOne({
      tenderId: tender.id,
      company: companyId,
      sourceHash,
    }).populate(deepAnalysisPopulateFields);

    const shouldStart =
      !deepAnalysis || deepAnalysis.status === TenderDeepAnalysisStatus.FAILED;

    if (!shouldStart && !forceUpdate) {
      return { deepAnalysis, shouldStart: false };
    }

    const deepAnalysisInProcess =
      await TenderDeepAnalysisModel.findOneAndUpdate(
        {
          tenderId: tender.id,
          company: companyId,
          language,
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
          $unset: {
            errorMessage: '',
            resultJson: '',
            executiveSummary: '',
            fitScore: '',
            fitConfidenceScore: '',
            participationReadinessScore: '',
            documentationCompletenessScore: '',
            requirementsClarityScore: '',
            riskScore: '',
            riskLevelScore: '',
            riskFitScore: '',
            opportunityScore: '',
            companyCapabilityScore: '',
            eligibilityFitScore: '',
            commercialFitScore: '',
            deadlineFitScore: '',
            recommendation: '',
            documentsAnalyzedCount: '',
            documentsTotalCount: '',
            missingDocumentsWarning: '',
            analyzedAt: '',
          },
        },
        { returnDocument: 'after', upsert: true },
      ).populate(deepAnalysisPopulateFields);

    return {
      deepAnalysis: deepAnalysisInProcess,
      shouldStart: true,
    };
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

  private async isSourceHashIsOutOfDate(
    deepAnalysis: TenderDeepAnalysisDocument | TenderDeepAnalysisRecord,
    companyAnalysis?: { sourceHash?: string } | null,
  ): Promise<boolean> {
    const [
      tenderSourceHash,
      generalAnalysisSourceHash,
      companyAnalysisSourceHash,
    ] = await Promise.all([
      getTenderSourceHash(deepAnalysis),
      getGeneralAnalysisSourceHash(deepAnalysis),
      companyAnalysis?.sourceHash
        ? companyAnalysis.sourceHash
        : getCompanyAnalysisSourceHash(deepAnalysis),
    ]);

    if (
      !deepAnalysis.sourceHash ||
      !tenderSourceHash ||
      !generalAnalysisSourceHash ||
      !companyAnalysisSourceHash
    ) {
      return false;
    }

    const currentSourceHash = this.buildSourceHash({
      tenderSourceHash,
      generalAnalysisSourceHash,
      companyAnalysisSourceHash,
      outputLanguage: normalizeDeepAnalysisLanguage(deepAnalysis.language),
    });

    return deepAnalysis.sourceHash !== currentSourceHash;
  }

  private async withOutOfDateFlag(
    deepAnalysis: TenderDeepAnalysisDocument | TenderDeepAnalysisRecord,
    companyAnalysis?: { sourceHash?: string } | null,
  ): Promise<TenderDeepAnalysisRecord> {
    const isOutOfDate = await this.isSourceHashIsOutOfDate(
      deepAnalysis,
      companyAnalysis,
    );

    return {
      ...toRecord(deepAnalysis),
      isOutOfDate,
    };
  }
}
