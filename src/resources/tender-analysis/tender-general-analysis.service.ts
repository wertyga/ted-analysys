import { forwardRef, Inject, Injectable } from '@nestjs/common';
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
import {
  GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
  GeneralTenderAnalysisInput,
} from '@/openai/dto/openai-analysis.dto';
import { createHash } from 'crypto';
import { getSafeErrorMessage, isDuplicateKeyError, sleep } from '@/utils';

@Injectable()
export class TenderGeneralAnalysisService {
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

            sourceHash: execution.sourceHash,
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

    const existingBaseAnalysis = await TenderGeneralAnalysisModel.findOne({
      tenderId: tender.id,
    }).exec();

    const hasDoneAnalysis =
      existingBaseAnalysis &&
      existingBaseAnalysis.resultJson &&
      existingBaseAnalysis.status === TenderGeneralAnalysisStatus.DONE;

    const isInProces =
      existingBaseAnalysis?.status === TenderGeneralAnalysisStatus.PROCESSING;

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
          },
        },
        { returnDocument: 'after', upsert: true },
      );

      // Async update of analysis
      this.fetchBaseAnalysis(analysis, tender);

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

    while (analysis.status !== TenderGeneralAnalysisStatus.DONE) {
      analysis = (await TenderGeneralAnalysisModel.findById(
        analysis._id,
      )) as TenderGeneralAnalysisDocument;

      if (analysis.status === TenderGeneralAnalysisStatus.FAILED) {
        break;
      }

      await sleep(1000);
    }

    return analysis;
  }

  async ensureBaseAnalysisForMultipleTenders(
    tenders: TenderDocument[],
  ): Promise<TenderGeneralAnalysisDocument[]> {
    return Promise.all(
      tenders.map(async (tender) => {
        return this.ensureAnalysisForTender(tender);
      }),
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

  buildGeneralTenderAnalysisSourceHash(
    input: GeneralTenderAnalysisInput,
    providerName: string,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          promptVersion: GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
          provider: providerName,
          tender: input.tender,
          documents: input.documents.map((document) => ({
            id: document.id,
            filename: document.filename,
            language: document.language,
            documentType: document.documentType,
            extractedText: document.extractedText,
          })),
        }),
      )
      .digest('hex');
  }
}
