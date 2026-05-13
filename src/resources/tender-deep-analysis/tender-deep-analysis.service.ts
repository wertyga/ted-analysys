import { forwardRef, Inject, Injectable } from '@nestjs/common';
import mongoose from 'mongoose';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import { getSafeErrorMessage, isDuplicateKeyError } from '@/utils';
import { UserModel } from '../user/user.schema';
import {
  TenderDocument,
  TenderModel,
  TenderRecord,
  TenderSerializable,
} from '../tenders/schemas';
import {
  TenderDeepAnalysis,
  TenderDeepAnalysisDocument,
  TenderDeepAnalysisModel,
  TenderDeepAnalysisStatus,
} from './schemas';
import { TenderGeneralAnalysisDocument } from '../tender-analysis/schemas';
import { TenderGeneralAnalysisService } from '../tender-analysis/tender-general-analysis.service';
import { TenderDeepAnalysisBuilder } from './tender-deep-analysis.builder';
import { TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION } from '@/openai/prompts/tender-deep-company-fit.prompt';
import { TenderDeepDocumentInputService } from './tender-deep-document-input.service';
import { CPV_CODES_LIST_FIELDS } from '@/resources/cpv/cpv.service';
import { TenderListDto } from '@/resources/tenders/dto/tender.dto';
import { CompanyTenderFilterModel } from '@/resources/company-filter/company-filter.schema';

type TenderDeepAnalysisRecord = TenderDeepAnalysis & {
  _id?: unknown;
  tender?: mongoose.Types.ObjectId | TenderRecord | TenderDocument;
};
type TenderDeepAnalysisWithTenderRecord = Omit<
  TenderDeepAnalysisRecord,
  'tender'
> & {
  tender?: TenderListDto | null;
};

@Injectable()
export class TenderDeepAnalysisService {
  constructor(
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
    private readonly deepAnalysisBuilder: TenderDeepAnalysisBuilder,
    private readonly deepDocumentInputService: TenderDeepDocumentInputService,
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
    try {
      const [tender, company, companyAnalysis] = await Promise.all([
        TenderModel.findOne({ id: tenderId }),
        UserModel.findById(companyId)
          .populate('industries', CPV_CODES_LIST_FIELDS)
          .populate('mainServices', CPV_CODES_LIST_FIELDS),
        CompanyTenderFilterModel.findOne({ user: companyId }),
      ]);

      if (!tender) {
        throw new Error('Tender not found');
      }
      if (!company) {
        throw new Error('Company not found');
      }

      // TODO: What if general analysis will be returned with FAILED status
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
        companyAnalysis,
        documentAnalyses: documentsInput.documentAnalyses,
        documentTextSnippets: documentsInput.documentTextSnippets,
        outputLanguage,
      });

      const rawResult =
        await this.deepSeekAnalysisService.analyzeTenderDeepCompanyFit(input);

      const normalized = this.deepAnalysisBuilder.normalizeResult(
        rawResult,
        input,
      );

      await localDeepAnalysis.updateOne({
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
    } catch (error: unknown) {
      await localDeepAnalysis.updateOne({
        $set: {
          status: TenderDeepAnalysisStatus.FAILED,
          errorMessage: getSafeErrorMessage(error),
        },
      });
    }
  }

  async analyzeTenderDeepCompanyFit(params: {
    tenderId: string;
    companyId: string;
    language?: string;
  }): Promise<TenderDeepAnalysisDocument> {
    const [tender, companyAnalysis, company] = await Promise.all([
      TenderModel.findOne({ id: params.tenderId }),
      CompanyTenderFilterModel.findOne({ user: params.companyId }),
      UserModel.findById(params.companyId),
    ]);

    if (!tender) {
      throw new Error('Tender not found');
    }
    if (!company) {
      throw new Error('Company not found');
    }

    const generalAnalysis =
      await this.tenderGeneralAnalysisService.getFinishedGeneralAnalysis(
        tender,
      );

    const sourceHash = this.deepAnalysisBuilder.buildSourceHash({
      tender,
      company,
      generalAnalysis,
      companyAnalysis,
      outputLanguage: params.language,
    });

    const { deepAnalysis: localDeepAnalysis, shouldStart } =
      await this.upsertProcessingAnalysisIfNeeded({
        tender,
        companyId: params.companyId,
        generalAnalysis: generalAnalysis,
        sourceHash,
      });

    if (shouldStart) {
      this.createDeepAnalysis({
        tenderId: params.tenderId,
        companyId: params.companyId,
        outputLanguage: params.language,
        localDeepAnalysis,
      });
    }

    return localDeepAnalysis;
  }

  async getLatestCompletedByTenderAndCompany(params: {
    tenderId: string;
    companyId: string;
  }): Promise<TenderDeepAnalysisRecord | null> {
    return TenderDeepAnalysisModel.findOne({
      tenderId: params.tenderId,
      company: params.companyId,
      status: TenderDeepAnalysisStatus.COMPLETED,
    })
      .sort({ analyzedAt: -1, updatedAt: -1 })
      .lean<TenderDeepAnalysisRecord>()
      .exec();
  }

  async listByCompany(params: {
    companyId: string;
    page?: number;
    limit?: number;
  }): Promise<{
    analyses: TenderDeepAnalysisWithTenderRecord[];
    total: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const skip = (page - 1) * limit;

    const [analyses, total] = await Promise.all([
      TenderDeepAnalysisModel.find({ company: params.companyId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('tender')
        .lean<TenderDeepAnalysisRecord[]>()
        .exec(),
      TenderDeepAnalysisModel.countDocuments({
        company: params.companyId,
      }).exec(),
    ]);

    return {
      analyses: analyses.map((analysis) => {
        const { tender, ...rest } = analysis;

        return {
          ...rest,
          tender: tender
            ? TenderModel.serializeList(tender as TenderSerializable)
            : null,
        };
      }),
      total,
    };
  }

  toDetailDto(
    analysis?: TenderDeepAnalysisRecord | null,
  ): TenderDeepAnalysisRecord | null {
    return analysis ?? null;
  }

  private async upsertProcessingAnalysisIfNeeded({
    tender,
    generalAnalysis,
    sourceHash,
    companyId,
  }: {
    tender: TenderDocument;
    companyId: string;
    generalAnalysis?: TenderGeneralAnalysisDocument | null;
    sourceHash: string;
  }): Promise<{
    deepAnalysis: TenderDeepAnalysisDocument;
    shouldStart: boolean;
  }> {
    try {
      const deepAnalysis = await TenderDeepAnalysisModel.findOne({
        tenderId: tender.id,
        company: companyId,
        sourceHash,
      })
        .populate('generalAnalysis')
        .populate('tender')
        .populate('company');

      const isNeedToUpdateOrCreateProcessing =
        !deepAnalysis ||
        deepAnalysis.status === TenderDeepAnalysisStatus.FAILED;

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
                generalAnalysis: generalAnalysis?._id,
                status: TenderDeepAnalysisStatus.PROCESSING,
                promptVersion: TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION,
              },
            },
            { returnDocument: 'after', upsert: true },
          );

        return {
          deepAnalysis: deepAnalysisInProcess,
          shouldStart: true,
        };
      }

      return { deepAnalysis, shouldStart: false };
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const duplicate = await TenderDeepAnalysisModel.findOne({
        tenderId: tender.id,
        company: companyId,
        sourceHash: sourceHash,
      }).exec();

      if (!duplicate) {
        throw error;
      }

      const shouldStart =
        duplicate.status === TenderDeepAnalysisStatus.FAILED ||
        duplicate.status === TenderDeepAnalysisStatus.PENDING;

      if (shouldStart) {
        const restarted = await TenderDeepAnalysisModel.findByIdAndUpdate(
          duplicate._id,
          {
            $set: {
              status: TenderDeepAnalysisStatus.PROCESSING,
              promptVersion: TENDER_DEEP_COMPANY_FIT_PROMPT_VERSION,
            },
          },
          { returnDocument: 'after' },
        ).exec();

        if (restarted) {
          return { deepAnalysis: restarted, shouldStart };
        }
      }

      return { deepAnalysis: duplicate, shouldStart };
    }
  }
}
