import { forwardRef, Inject, Injectable } from '@nestjs/common';
import mongoose from 'mongoose';
import {
  TenderGeneralAnalysis,
  TenderGeneralAnalysisDocument,
  TenderGeneralAnalysisModel,
  TenderGeneralAnalysisStatus,
} from './schemas';
import {
  TenderGeneralAnalysisDetailDto,
  TenderGeneralAnalysisListDto,
} from './dto/tender-general-analysis.dto';
import { TenderAnalysisService } from './tender-analysis.service';
import { TenderDocument, TenderModel } from '../tenders/schemas';
import {
  TedNotice,
  TedSearchResponse,
} from '../ted-search/types/ted-search.types';
import { TenderGeneralAnalysisBuilder } from './tender-general-analysis.builder';
import { Tender } from '../tenders/schemas';
import {
  GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
  GeneralTenderAnalysisInput,
} from '@/openai/dto/openai-analysis.dto';
import { createHash } from 'crypto';
import {
  extractPublicationNumberFromNotice,
  getSafeErrorMessage,
  isDuplicateKeyError,
  valueToString,
} from '@/utils';
import { TendersService } from '@/resources/tenders/tenders.service';

type TenderGeneralAnalysisRecord = TenderGeneralAnalysis & { _id?: unknown };
type TenderUpsertRecord = Tender & { _id: mongoose.Types.ObjectId };

@Injectable()
export class TenderGeneralAnalysisService {
  constructor(
    @Inject(forwardRef(() => TenderAnalysisService))
    private readonly tenderAnalysisService: TenderAnalysisService,
    private readonly analysisBuilder: TenderGeneralAnalysisBuilder,
    @Inject(forwardRef(() => TendersService))
    private readonly tendersService: TendersService,
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

      return TenderGeneralAnalysisModel.findByIdAndUpdate(
        baseTenderAnalysis._id,
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
      // TODO: Check source hash
      return existingBaseAnalysis;
    }

    try {
      const analysis = await TenderGeneralAnalysisModel.findOneAndUpdate(
        {
          tender: tenderObjectId,

          tenderId: tender.id,
        },
        {
          $set: {
            status: TenderGeneralAnalysisStatus.PROCESSING,
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
        tender: tenderObjectId,
        tenderId: tender.id,
      }).exec();

      if (duplicate) {
        return duplicate;
      }

      throw error;
    }
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

    return this.toDetailDto(analysis);
  }

  toListDto(
    analysis: TenderGeneralAnalysisRecord | null,
  ): TenderGeneralAnalysisListDto | null {
    if (!analysis) {
      return null;
    }

    return {
      status: analysis.status,
      summary: analysis.summary,
      complexityScore: analysis.complexityScore,
      opportunityScore: analysis.opportunityScore,
      generalRecommendation: analysis.generalRecommendation,
      confidenceScore: analysis.confidenceScore,
      updatedAt: analysis.updatedAt,
    };
  }

  toDetailDto(
    analysis: TenderGeneralAnalysisRecord | null,
  ): TenderGeneralAnalysisDetailDto | null {
    if (!analysis) {
      return null;
    }

    const listDto = this.toListDto(analysis);

    if (listDto === null) {
      return null;
    }

    return {
      ...listDto,
      resultJson: analysis.resultJson,
      ...(analysis.status === TenderGeneralAnalysisStatus.FAILED
        ? { errorMessage: analysis.errorMessage }
        : {}),
    };
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
