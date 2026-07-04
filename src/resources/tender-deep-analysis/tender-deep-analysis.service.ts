import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import {
  companyCpvPopulateFields,
  deepAnalysisPopulateFields,
  devLog,
  getPaginationMeta,
  getMongoRelationObjectIdArray,
  getSafeErrorMessage,
  logger,
  QueueAsyncConcurrency,
  tenderPopulateFields,
  toRecord,
} from '@/utils';
import { UserModel } from '../user/user.schema';
import { TenderDocument, TenderModel } from '../tenders/schemas';
import {
  TenderDeepAnalysisDocument,
  TenderDeepAnalysisModel,
  TenderDeepAnalysisRecord,
  TenderDeepAnalysisStatus,
} from './schemas/tender-deep-analysis.schema';
import { TenderGeneralAnalysisService } from '../tender-analysis/tender-general-analysis.service';
import { TenderDeepAnalysisBuilder } from './tender-deep-analysis.builder';
import { TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION } from './tender-deep-company-fit.prompt';
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
} from './tender-deep-analysis.utils';
import { CompanyProfileDocumentsService } from '@/resources/company-profile-documents/company-profile-documents.service';
import { TENDER_DEEP_ANALYSIS_CONFIG } from '@/config/tender-deep-analysis.config';
import fs from 'node:fs';
import { BuyerIntelligenceModel } from '@/resources/buyer-intelligence/schemas';
import { TenderGeneralAnalysisStatus } from '@/resources/tender-analysis/schemas';
import { TenderDeepBuyerIntelligenceInput } from '@/types';
import { BuyerIntelligenceService } from '@/resources/buyer-intelligence';
import { BuyerDocument } from '@/resources/buyer/schemas';
@Injectable()
export class TenderDeepAnalysisService {
  private readonly deepCompanyFitAnalysisQueue = new QueueAsyncConcurrency(
    TENDER_DEEP_ANALYSIS_CONFIG.companyFitAnalysis.concurrency,
  );
  constructor(
    private readonly llmAnalysisService: LlmAnalysisService,
    private readonly deepAnalysisBuilder: TenderDeepAnalysisBuilder,
    private readonly deepDocumentInputService: TenderDeepDocumentInputService,
    private readonly tendersService: TendersService,
    private readonly companyFilterService: CompanyFilterService,
    private readonly companyProfileDocumentsService: CompanyProfileDocumentsService,
    private readonly buyerIntelligenceService: BuyerIntelligenceService,
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
        TenderModel.findOne({ id: tenderId }).populate(tenderPopulateFields),
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
      console.log(tender);
      const buyerIntelligence =
        await this.getBuyerIntelligenceInputForTender(tender);
      const tenderDocumentsInput =
        await this.deepDocumentInputService.buildDeepDocumentInput(tender);
      const input = this.deepAnalysisBuilder.buildInput({
        tender,
        generalAnalysis,
        company: companyDto,
        companyAnalysis,
        buyerIntelligence,
        documentMetadata: tenderDocumentsInput.documentMetadata,
        documentTextSnippets: tenderDocumentsInput.documentTextSnippets,
        outputLanguage: language,
      });
      const rawResult = await this.deepCompanyFitAnalysisQueue.push(() =>
        this.llmAnalysisService.analyzeTenderDeepCompanyFit(input),
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
            recommendation: normalized.finalRecommendation.value,
            documentsAnalyzedCount:
              tenderDocumentsInput.documentMetadata.length,
            missingDocumentsWarning:
              normalized.documentationAnalysis.missingDocuments.length > 0,
            analyzedAt: new Date(),
          },
          $unset: { errorMessage: '' },
        },
        { runValidators: true },
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
  }): Promise<TenderDeepAnalysisDocument> {
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
    const buyerIntelligenceSourceHash =
      await this.getBuyerIntelligenceSourceHashForTender(tender);
    const sourceHash = this.buildSourceHash({
      generalAnalysisSourceHash: generalAnalysis.sourceHash,
      companyAnalysisSourceHash: companyAnalysis.sourceHash,
      tenderSourceHash: tender.sourceHash,
      buyerIntelligenceSourceHash,
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
            recommendation: '',
            documentsAnalyzedCount: '',
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
    buyerIntelligenceSourceHash?: string;
    outputLanguage?: string;
  }): string {
    const outputLanguage = normalizeDeepAnalysisLanguage(input.outputLanguage);
    return createHash('sha256')
      .update(
        JSON.stringify({
          provider: this.llmAnalysisService.getProvider(),
          model: this.llmAnalysisService.getDeepAnalysisModel(),
          promptVersion: TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION,
          outputLanguage,
          generalAnalysisSourceHash: input.generalAnalysisSourceHash,
          companyAnalysisSourceHash: input.companyAnalysisSourceHash,
          buyerIntelligenceSourceHash: input.buyerIntelligenceSourceHash ?? '',
          tenderSourceHash: input.tenderSourceHash,
        }),
      )
      .digest('hex');
  }

  private async getBuyerIntelligenceInputForTender(
    tender: Pick<TenderDocument, 'leadBuyers'>,
  ): Promise<TenderDeepBuyerIntelligenceInput[]> {
    const buyerIds = tender.leadBuyers.map((b: BuyerDocument) =>
      b._id.toString(),
    );
    console.log({ buyerIds });
    if (!buyerIds.length) {
      return [];
    }

    const records = await Promise.all(
      buyerIds.map((buyerId) =>
        this.buyerIntelligenceService.getFinishedBuyerIntelligence({ buyerId }),
      ),
    );

    console.log({ records });

    return records.map((record) => {
      const buyer = record.buyer as { _id?: unknown; name?: string } | string;
      const buyerId =
        typeof buyer === 'string'
          ? buyer
          : (buyer?._id?.toString() ?? record.buyer.toString());

      return {
        buyerId,
        buyerName: typeof buyer === 'object' ? buyer.name : undefined,
        summary: record.summary,
        procurementProfile: record.procurementProfile,
        marketBehavior: record.marketBehavior,
        supplierLandscape: record.supplierLandscape,
        historicalTrends: record.historicalTrends,
        dataLimitations: record.dataLimitations,
        buyerDecisionSignals: record.buyerDecisionSignals,
      };
    });
  }

  private async getBuyerIntelligenceSourceHashForTender(
    tender: Pick<TenderDocument, 'leadBuyers'>,
  ): Promise<string> {
    const buyerIds = getMongoRelationObjectIdArray(tender.leadBuyers ?? []);

    if (!buyerIds.length) {
      return '';
    }

    const records = await BuyerIntelligenceModel.find({
      buyer: { $in: buyerIds },
      status: TenderGeneralAnalysisStatus.DONE,
    })
      .select('buyer sourceHash')
      .sort({ buyer: 1 })
      .lean()
      .exec();

    return createHash('sha256')
      .update(
        JSON.stringify(
          records.map((record) => ({
            buyer: record.buyer?.toString(),
            sourceHash: record.sourceHash,
          })),
        ),
      )
      .digest('hex');
  }

  private async getBuyerIntelligenceSourceHashForDeepAnalysis(
    deepAnalysis: TenderDeepAnalysisDocument | TenderDeepAnalysisRecord,
  ): Promise<string> {
    if (!deepAnalysis.tender) {
      return '';
    }

    if (
      typeof deepAnalysis.tender === 'object' &&
      'leadBuyers' in deepAnalysis.tender
    ) {
      return this.getBuyerIntelligenceSourceHashForTender(
        deepAnalysis.tender as unknown as Pick<TenderDocument, 'leadBuyers'>,
      );
    }

    const tender = await TenderModel.findById(deepAnalysis.tender)
      .select('leadBuyers')
      .lean<Pick<TenderDocument, 'leadBuyers'>>()
      .exec();

    return tender ? this.getBuyerIntelligenceSourceHashForTender(tender) : '';
  }

  private async isSourceHashIsOutOfDate(
    deepAnalysis: TenderDeepAnalysisDocument | TenderDeepAnalysisRecord,
    companyAnalysis?: { sourceHash?: string } | null,
  ): Promise<boolean> {
    const [
      tenderSourceHash,
      generalAnalysisSourceHash,
      companyAnalysisSourceHash,
      buyerIntelligenceSourceHash,
    ] = await Promise.all([
      getTenderSourceHash(deepAnalysis),
      getGeneralAnalysisSourceHash(deepAnalysis),
      companyAnalysis?.sourceHash
        ? companyAnalysis.sourceHash
        : getCompanyAnalysisSourceHash(deepAnalysis),
      this.getBuyerIntelligenceSourceHashForDeepAnalysis(deepAnalysis),
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
      buyerIntelligenceSourceHash,
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
