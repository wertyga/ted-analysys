import { forwardRef, Inject, Injectable } from '@nestjs/common';
import mongoose from 'mongoose';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import { getSafeErrorMessage, isDuplicateKeyError } from '@/utils';
import { UserModel } from '../user/user.schema';
import { TenderDocument, TenderModel } from '../tenders/schemas';
import {
  TenderDeepAnalysis,
  TenderDeepAnalysisDocument,
  TenderDeepAnalysisModel,
  TenderDeepAnalysisStatus,
} from './schemas';
import {
  TenderGeneralAnalysisDocument,
  TenderGeneralAnalysisStatus,
} from '../tender-analysis/schemas';
import { TenderGeneralAnalysisService } from '../tender-analysis/tender-general-analysis.service';
import { TenderDeepAnalysisBuilder } from './tender-deep-analysis.builder';
import { TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION } from '@/openai/prompts/tender-deep-company-fit.prompt';
import { TenderDeepDocumentInputService } from './tender-deep-document-input.service';
import * as fs from 'node:fs';
import { CPV_CODES_LIST_FIELDS } from '@/resources/cpv/cpv.service';

type TenderDeepAnalysisRecord = TenderDeepAnalysis & { _id?: unknown };

@Injectable()
export class TenderDeepAnalysisService {
  constructor(
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
    private readonly deepAnalysisBuilder: TenderDeepAnalysisBuilder,
    private readonly deepDocumentInputService: TenderDeepDocumentInputService,
    @Inject(forwardRef(() => TenderGeneralAnalysisService))
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  async analyzeTenderDeepCompanyFit(params: {
    tenderId: string;
    companyId: string;
  }): Promise<TenderDeepAnalysisDocument> {
    const tender = await TenderModel.findOne({ id: params.tenderId }).exec();

    if (!tender) {
      throw new Error('Tender not found');
    }

    const company = await UserModel.findById(params.companyId)
      .populate('industries', CPV_CODES_LIST_FIELDS)
      .populate('mainServices', CPV_CODES_LIST_FIELDS)
      .exec();

    if (!company) {
      throw new Error('Company not found');
    }

    const generalAnalysis =
      await this.tenderGeneralAnalysisService.getFinishedGeneralAnalysis(
        tender,
      );

    const companyDto =
      this.deepAnalysisBuilder.buildCompanyAnalysisDto(company);

    const documentsInput =
      await this.deepDocumentInputService.buildDeepDocumentInput(tender);

    const input = this.deepAnalysisBuilder.buildInput({
      tender,
      generalAnalysis,
      company: companyDto,
      companyAnalysis: null,
      documentAnalyses: documentsInput.documentAnalyses,
      documentTextSnippets: documentsInput.documentTextSnippets,
    });
    fs.writeFileSync('test.json', JSON.stringify(input));

    const sourceHash = this.deepAnalysisBuilder.buildSourceHash({
      tender,
      company,
      generalAnalysis,
      companyAnalysis: null,
      documentAnalyses: documentsInput.documentAnalyses,
      documentTextSnippets: documentsInput.documentTextSnippets,
    });

    const existing = await TenderDeepAnalysisModel.findOne({
      tenderId: tender.id,
      companyId: String(company._id),
      sourceHash,
      status: TenderDeepAnalysisStatus.COMPLETED,
    }).exec();
    //
    if (existing) {
      return existing;
    }

    const analysis = await this.createProcessingAnalysis({
      tender,
      companyId: String(company._id),
      companyObjectId: company._id as mongoose.Types.ObjectId,
      generalAnalysis,
      sourceHash,
    });

    try {
      const rawResult =
        await this.deepSeekAnalysisService.analyzeTenderDeepCompanyFit(input);
      const normalized = this.deepAnalysisBuilder.normalizeResult(
        rawResult,
        input,
      );

      await analysis.updateOne({
        $set: {
          status: TenderDeepAnalysisStatus.COMPLETED,
          resultJson: normalized,
          executiveSummary: normalized.executiveSummary,
          fitScore: normalized.scores.fitScore,
          fitConfidenceScore: normalized.scores.fitConfidenceScore,
          participationReadinessScore:
            normalized.scores.participationReadinessScore,
          documentationCompletenessScore:
            normalized.scores.documentationCompletenessScore,
          requirementsClarityScore: normalized.scores.requirementsClarityScore,
          riskScore: normalized.scores.riskScore,
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

      return (await TenderDeepAnalysisModel.findById(
        analysis._id,
      ).exec()) as TenderDeepAnalysisDocument;
    } catch (error: unknown) {
      await analysis.updateOne({
        $set: {
          status: TenderDeepAnalysisStatus.FAILED,
          errorMessage: getSafeErrorMessage(error),
        },
      });

      throw error;
    }
  }

  async getLatestCompletedByTenderAndCompany(params: {
    tenderId: string;
    companyId: string;
  }): Promise<TenderDeepAnalysisRecord | null> {
    return TenderDeepAnalysisModel.findOne({
      tenderId: params.tenderId,
      companyId: params.companyId,
      status: TenderDeepAnalysisStatus.COMPLETED,
    })
      .sort({ analyzedAt: -1, updatedAt: -1 })
      .lean<TenderDeepAnalysisRecord>()
      .exec();
  }

  toDetailDto(
    analysis?: TenderDeepAnalysisRecord | null,
  ): TenderDeepAnalysisRecord | null {
    return analysis ?? null;
  }

  private async getOrCreateCompletedGeneralAnalysis(
    tender: TenderDocument,
  ): Promise<TenderGeneralAnalysisDocument | null> {
    const generalAnalysis =
      await this.tenderGeneralAnalysisService.ensureAnalysisForTender(tender);

    if (generalAnalysis.status === TenderGeneralAnalysisStatus.DONE) {
      return generalAnalysis;
    }

    return generalAnalysis;
  }

  private async createProcessingAnalysis(params: {
    tender: TenderDocument;
    companyId: string;
    companyObjectId: mongoose.Types.ObjectId;
    generalAnalysis?: TenderGeneralAnalysisDocument | null;
    sourceHash: string;
  }): Promise<TenderDeepAnalysisDocument> {
    try {
      return await TenderDeepAnalysisModel.create({
        tenderId: params.tender.id,
        tender: params.tender._id,
        companyId: params.companyId,
        company: params.companyObjectId,
        generalAnalysis: params.generalAnalysis?._id,
        status: TenderDeepAnalysisStatus.PROCESSING,
        sourceHash: params.sourceHash,
        promptVersion: TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION,
        analysisDepth: 'deep_company_fit',
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const duplicate = await TenderDeepAnalysisModel.findOneAndUpdate(
        {
          tenderId: params.tender.id,
          companyId: params.companyId,
          sourceHash: params.sourceHash,
        },
        {
          $set: {
            status: TenderDeepAnalysisStatus.PROCESSING,
            promptVersion: TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION,
          },
        },
        { returnDocument: 'after' },
      ).exec();

      if (!duplicate) {
        throw error;
      }

      return duplicate;
    }
  }
}
