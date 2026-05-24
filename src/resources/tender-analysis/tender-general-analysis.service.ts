import {
  forwardRef,
  Inject,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import mongoose from 'mongoose';
import {
  TenderGeneralAnalysisDocument,
  TenderGeneralAnalysisModel,
  TenderGeneralAnalysisRecord,
  TenderGeneralAnalysisStatus,
} from './schemas';
import { TenderGeneralAnalysisDetailDto } from './dto/tender-general-analysis.dto';
import { TenderAnalysisService } from './tender-analysis.service';
import { TenderDocument } from '../tenders/schemas';
import { TenderGeneralAnalysisBuilder } from './tender-general-analysis.builder';
import { GENERAL_TENDER_ANALYSIS_PROMPT_VERSION } from '@/openai/dto/openai-analysis.dto';
import { createHash } from 'crypto';
import {
  getSafeErrorMessage,
  isDuplicateKeyError,
  QueueAsyncConcurrency,
  sleep,
} from '@/utils';

const ANALYSIS_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const ANALYSIS_WAIT_INTERVAL_MS = 1000;
const BASE_ANALYSIS_CONCURRENCY = 20;
const FREE_BASIC_ANALYSIS_FIELDS = [
  'summary',
  {
    name: 'scopeOfWork',
    len: 2,
  },
  {
    name: 'keyRequirements',
    len: 3,
  },
  { name: 'risks', len: 2 },
  'deadlines',
  'estimatedValue',
  'complexityScore',
  'opportunityScore',
  'confidenceScore',
  'generalRecommendation',
  'analysisDepth',
  'documentsAnalyzedCount',
  'missingDocumentsWarning',
] as const;

@Injectable()
export class TenderGeneralAnalysisService {
  private readonly baseAnalysisQueue = new QueueAsyncConcurrency(
    BASE_ANALYSIS_CONCURRENCY,
  );

  constructor(
    @Inject(forwardRef(() => TenderAnalysisService))
    private readonly tenderAnalysisService: TenderAnalysisService,
    private readonly analysisBuilder: TenderGeneralAnalysisBuilder,
  ) {}

  async fetchBaseAnalysis(
    baseTenderAnalysis: TenderGeneralAnalysisDocument,
    tender: TenderDocument,
  ): Promise<TenderGeneralAnalysisDocument | null> {
    try {
      const analysisInput =
        await this.analysisBuilder.buildAnalysisInput(tender);

      const execution =
        await this.tenderAnalysisService.analyzeTenderGeneral(analysisInput);

      const sourceHash =
        this.tenderAnalysisService.getBaseAnalysisSourceHash(tender);

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

            estimatedValue: result.estimatedValue,

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
    const sourceHash =
      this.tenderAnalysisService.getBaseAnalysisSourceHash(tender);

    const existingBaseAnalysis = await TenderGeneralAnalysisModel.findOne({
      tenderId: tender.id,
    }).exec();

    const isHashEqual = existingBaseAnalysis?.sourceHash === sourceHash;

    const hasDoneAnalysis =
      existingBaseAnalysis?.resultJson &&
      existingBaseAnalysis.status === TenderGeneralAnalysisStatus.DONE &&
      isHashEqual;

    const isInProces =
      existingBaseAnalysis?.status === TenderGeneralAnalysisStatus.PROCESSING &&
      isHashEqual;

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
    const waitUntil = Date.now() + ANALYSIS_WAIT_TIMEOUT_MS;

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

      await sleep(ANALYSIS_WAIT_INTERVAL_MS);
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
      return null;
    }

    const resultJson: Partial<T> = {};

    FREE_BASIC_ANALYSIS_FIELDS.forEach((field) => {
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
    providerName: string,
    model: string,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          promptVersion: GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
          provider: providerName,
          tenderSourceHash: tender.sourceHash,
          model,
        }),
      )
      .digest('hex');
  }
}
