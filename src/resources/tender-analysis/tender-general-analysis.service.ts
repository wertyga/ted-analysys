import { Injectable, RequestTimeoutException } from '@nestjs/common';
import mongoose from 'mongoose';
import {
  TenderGeneralAnalysisDocument,
  TenderGeneralAnalysisModel,
  TenderGeneralAnalysisRecord,
  TenderGeneralAnalysisStatus,
} from './schemas';
import { TenderGeneralAnalysisDetailDto } from './dto/tender-general-analysis.dto';
import { TenderDocument } from '../tenders/schemas';
import { TenderGeneralAnalysisBuilder } from './tender-general-analysis.builder';
import {
  GeneralTenderAnalysisInput,
  GeneralTenderAnalysisResult,
} from '@/openai/dto/openai-analysis.dto';
import { createHash } from 'crypto';
import {
  devLog,
  getSafeErrorMessage,
  isDuplicateKeyError,
  QueueAsyncConcurrency,
  sleep,
} from '@/utils';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import { TENDER_ANALYSIS_CONFIG } from '@/config/tender-analysis.config';
import { GENERAL_TENDER_ANALYSIS_PROMPT_VERSION } from '@/resources/tender-analysis/general-tender-analysis.prompt';

export interface TenderAnalysisExecutionResult {
  result: GeneralTenderAnalysisResult;
  promptVersion: string;
  model: string;
}

@Injectable()
export class TenderGeneralAnalysisService {
  private readonly baseAnalysisQueue = new QueueAsyncConcurrency(
    TENDER_ANALYSIS_CONFIG.baseAnalysis.concurrency,
  );

  constructor(
    private readonly analysisBuilder: TenderGeneralAnalysisBuilder,
    private readonly llmAnalysisService: LlmAnalysisService,
  ) {}

  async fetchBaseAnalysis(
    baseTenderAnalysis: TenderGeneralAnalysisDocument,
    tender: TenderDocument,
  ): Promise<TenderGeneralAnalysisDocument | null> {
    try {
      const analysisInput =
        await this.analysisBuilder.buildAnalysisInput(tender);

      const execution = await this.analyzeTenderGeneral(analysisInput);

      const sourceHash = this.buildGeneralTenderAnalysisSourceHash(tender);

      const result = execution.result;

      return TenderGeneralAnalysisModel.findOneAndUpdate(
        {
          tenderId: tender.id,
        },
        {
          $set: {
            status: TenderGeneralAnalysisStatus.DONE,

            resultJson: result,
            summary: result.summary,

            complexityScore: result.complexityScore,
            opportunityScore: result.opportunityScore,
            generalRecommendation: result.generalRecommendation,
            confidenceScore: result.confidenceScore,

            analysisDepth: result.analysisDepth,
            documentsAnalyzedCount: result.documentsAnalyzedCount,
            missingDocumentsWarning: result.missingDocumentsWarning,

            sourceHash,
            promptVersion: execution.promptVersion,
            model: execution.model,
          },
          $unset: {
            errorMessage: '',
            estimatedValue: '',
          },
        },
      );
    } catch (error: unknown) {
      return TenderGeneralAnalysisModel.findByIdAndUpdate(
        baseTenderAnalysis._id,
        {
          $set: {
            status: TenderGeneralAnalysisStatus.FAILED,
            errorMessage: getSafeErrorMessage(error),
          },
        },
        { returnDocument: 'after' },
      );
    }
  }

  async ensureAnalysisForTender(
    tender: TenderDocument,
    isForceBaseAnalysis = false,
  ): Promise<TenderGeneralAnalysisDocument> {
    const tenderObjectId = tender._id as mongoose.Types.ObjectId;
    const sourceHash = this.buildGeneralTenderAnalysisSourceHash(tender);

    const existingBaseAnalysis = await TenderGeneralAnalysisModel.findOne({
      tenderId: tender.id,
    });

    const isHashEqual = existingBaseAnalysis?.sourceHash === sourceHash;

    const hasDoneAnalysis =
      existingBaseAnalysis?.resultJson &&
      existingBaseAnalysis.status === TenderGeneralAnalysisStatus.DONE &&
      isHashEqual;

    const isStaleProcessing =
      existingBaseAnalysis?.status === TenderGeneralAnalysisStatus.PROCESSING &&
      this.isStaleProcessingAnalysis(existingBaseAnalysis);

    const isInProces =
      existingBaseAnalysis?.status === TenderGeneralAnalysisStatus.PROCESSING &&
      isHashEqual &&
      !isStaleProcessing;

    if ((hasDoneAnalysis || isInProces) && !isForceBaseAnalysis) {
      return existingBaseAnalysis;
    }

    try {
      const analysis = await TenderGeneralAnalysisModel.findOneAndUpdate(
        {
          tenderId: tender.id,
        },
        {
          $set: {
            status: TenderGeneralAnalysisStatus.PROCESSING,
            tender: tenderObjectId,
            promptVersion: GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
            sourceHash,
          },
        },
        { returnDocument: 'after', upsert: true },
      );

      // Async update of analysis with bounded concurrency.
      void this.baseAnalysisQueue.push(() =>
        this.fetchBaseAnalysis(analysis, tender),
      );

      return analysis;
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const duplicate = await TenderGeneralAnalysisModel.findOne({
        tenderId: tender.id,
      }).exec();

      if (duplicate) {
        return duplicate;
      }

      throw error;
    }
  }

  async getFinishedGeneralAnalysis(tender: TenderDocument) {
    let analysis = await this.ensureAnalysisForTender(tender);
    const waitUntil = Date.now() + TENDER_ANALYSIS_CONFIG.wait.timeoutMs;

    while (analysis.status !== TenderGeneralAnalysisStatus.DONE) {
      if (Date.now() >= waitUntil) {
        throw new RequestTimeoutException(
          `General analysis for tender ${tender.id} was not finished within 10 minutes`,
        );
      }

      analysis = (await TenderGeneralAnalysisModel.findById(
        analysis._id,
      )) as TenderGeneralAnalysisDocument;

      if (analysis.status === TenderGeneralAnalysisStatus.FAILED) {
        throw new Error(
          `General analysis for tender ${tender.id} failed: ${
            analysis.errorMessage ?? 'unknown error'
          }`,
        );
      }

      await sleep(TENDER_ANALYSIS_CONFIG.wait.intervalMs);
    }

    return analysis;
  }

  async ensureBaseAnalysisForMultipleTenders(
    tenders: TenderDocument[],
  ): Promise<TenderGeneralAnalysisDocument[]> {
    const results = await Promise.allSettled(
      tenders.map(async (tender) => {
        return this.ensureAnalysisForTender(tender);
      }),
    );

    return results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
  }

  async getDetailByTenderId(
    tenderId: string,
  ): Promise<TenderGeneralAnalysisDetailDto | null> {
    const analysis = await TenderGeneralAnalysisModel.findOne({
      tenderId,
    })
      .lean<TenderGeneralAnalysisRecord>()
      .exec();

    if (!analysis) {
      return null;
    }

    return TenderGeneralAnalysisModel.serializeDetail(analysis);
  }

  filterFreeBasicAnalysisFields<T extends { resultJson?: any }>(
    analysis: T | null,
  ): Partial<T> | null {
    if (!analysis?.resultJson) {
      return analysis;
    }

    const resultJson: Partial<T> = {};

    TENDER_ANALYSIS_CONFIG.freeBasicAnalysisFields.forEach((field) => {
      if (typeof field === 'string') {
        resultJson[field] = analysis.resultJson[field];
      }
      if (typeof field === 'object') {
        resultJson[field.name] = Array.isArray(analysis.resultJson[field.name])
          ? analysis.resultJson[field.name].slice(0, field.len ?? 100)
          : analysis.resultJson[field.name];
      }
    });

    return {
      ...analysis,
      resultJson,
    };
  }

  buildGeneralTenderAnalysisSourceHash(
    tender: Pick<TenderDocument, 'sourceHash'>,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          promptVersion: GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
          provider: this.llmAnalysisService.getProvider(),
          tenderSourceHash: tender.sourceHash,
          model: this.llmAnalysisService.getGeneralAnalysisModel(),
        }),
      )
      .digest('hex');
  }

  private isStaleProcessingAnalysis(
    analysis: Pick<TenderGeneralAnalysisDocument, 'updatedAt'>,
  ): boolean {
    if (!(analysis.updatedAt instanceof Date)) {
      return true;
    }

    return (
      Date.now() - analysis.updatedAt.getTime() >
      TENDER_ANALYSIS_CONFIG.baseAnalysis.processingTimeoutMs
    );
  }

  private async analyzeTenderGeneral(
    input: GeneralTenderAnalysisInput,
  ): Promise<TenderAnalysisExecutionResult> {
    const result =
      await this.llmAnalysisService.analyzeTenderGeneral(input);

    devLog(
      `General tender analysis completed: tender=${input.tender.id}`,
      TenderGeneralAnalysisService.name,
    );

    return {
      result,
      promptVersion: GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
      model: this.llmAnalysisService.getGeneralAnalysisModel(),
    };
  }
}


