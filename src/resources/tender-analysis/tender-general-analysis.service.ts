import { Injectable } from '@nestjs/common';
import mongoose from 'mongoose';
import {
  TenderGeneralAnalysis,
  TenderGeneralAnalysisDocument,
  TenderGeneralAnalysisModel,
  TenderGeneralRecommendation,
  TenderGeneralAnalysisStatus,
} from './schemas';
import {
  TenderGeneralAnalysisDetailDto,
  TenderGeneralAnalysisListDto,
} from './dto/tender-general-analysis.dto';
import { TenderAnalysisService } from './tender-analysis.service';
import { GeneralGoNoGo } from '@/openai/dto/openai-analysis.dto';
import { TenderDocument, TenderModel } from '../tenders/schemas';
import {
  TedNotice,
  TedSearchResponse,
} from '../ted-search/types/ted-search.types';
import { TenderGeneralAnalysisBuilder } from './tender-general-analysis.builder';

type TenderGeneralAnalysisRecord = TenderGeneralAnalysis & { _id?: unknown };

@Injectable()
export class TenderGeneralAnalysisService {
  constructor(
    private readonly tenderAnalysisService: TenderAnalysisService,
    private readonly analysisBuilder: TenderGeneralAnalysisBuilder,
  ) {}

  async ensureAnalyzedForTender(tender: TenderDocument): Promise<void> {
    const tenderObjectId = tender._id as mongoose.Types.ObjectId;
    const existing = await TenderGeneralAnalysisModel.findOne({
      tender: tenderObjectId,
    }).exec();

    const analysisExists =
      existing &&
      existing.status !== TenderGeneralAnalysisStatus.FAILED &&
      existing.resultJson;

    if (analysisExists) {
      return;
    }

    let analysis: TenderGeneralAnalysisDocument;

    try {
      analysis = await TenderGeneralAnalysisModel.findOneAndUpdate(
        {
          tender: tenderObjectId,
        },
        {
          $set: {
            status: TenderGeneralAnalysisStatus.PROCESSING,
            tenderId: tender.id,
          },
        },
        { new: true, upsert: true },
      );
    } catch (error: unknown) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }

      const duplicate = await TenderGeneralAnalysisModel.findOne({
        tender: tenderObjectId,
      }).exec();

      if (duplicate) {
        return;
      }

      throw error;
    }

    try {
      const analysisInput =
        await this.analysisBuilder.buildAnalysisInput(tender);

      const execution =
        await this.tenderAnalysisService.analyzeTenderGeneral(analysisInput);

      const result = execution.result;

      await TenderGeneralAnalysisModel.findByIdAndUpdate(analysis._id, {
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
      }).exec();
    } catch (error: unknown) {
      console.log({ error });
      await TenderGeneralAnalysisModel.findByIdAndUpdate(
        analysis._id,
        {
          $set: {
            status: TenderGeneralAnalysisStatus.FAILED,
            errorMessage: this.getSafeErrorMessage(error),
          },
        },
        { new: true },
      ).exec();
    }
  }

  async getDetailByTenderId(
    tenderId: string,
  ): Promise<TenderGeneralAnalysisDetailDto | null> {
    const tender = await TenderModel.findOne({ id: tenderId })
      .select({ _id: 1 })
      .lean<{ _id: mongoose.Types.ObjectId }>()
      .exec();

    if (!tender) {
      return null;
    }

    const analysis = await TenderGeneralAnalysisModel.findOne({
      tender: tender._id,
    })
      .lean<TenderGeneralAnalysisRecord>()
      .exec();

    return this.toDetailDto(analysis);
  }

  async addGeneralAnalysisToTenderSearchResponse(
    response: TedSearchResponse,
  ): Promise<TedSearchResponse> {
    if (!Array.isArray(response.notices) || response.notices.length === 0) {
      return response;
    }

    const publicationNumbers = Array.from(
      new Set(
        response.notices
          .map((notice) => this.extractPublicationNumberFromNotice(notice))
          .filter((value): value is string => value !== undefined),
      ),
    );

    if (publicationNumbers.length === 0) {
      return response;
    }

    const tenders = await TenderModel.find({
      $or: [
        { publicationNumber: { $in: publicationNumbers } },
        { sourceNoticeId: { $in: publicationNumbers } },
        { id: { $in: publicationNumbers } },
      ],
    })
      .select({ _id: 1, id: 1, publicationNumber: 1, sourceNoticeId: 1 })
      .lean()
      .exec();

    if (tenders.length === 0) {
      return response;
    }

    const analyses = await TenderGeneralAnalysisModel.find({
      tender: { $in: tenders.map((tender) => tender._id) },
    })
      .lean()
      .exec();
    const analysesByTenderId = new Map(
      analyses.map((analysis) => [String(analysis.tender), analysis]),
    );
    const analysesByPublicationNumber = new Map<
      string,
      TenderGeneralAnalysisListDto
    >();

    for (const tender of tenders) {
      const analysis = analysesByTenderId.get(String(tender._id));
      const analysisDto = this.toListDto(analysis ?? null);

      if (analysisDto === null) {
        continue;
      }

      for (const key of this.getTenderPublicationKeys(tender)) {
        analysesByPublicationNumber.set(key, analysisDto);
      }
    }

    return {
      ...response,
      notices: response.notices.map((notice) => {
        const publicationNumber =
          this.extractPublicationNumberFromNotice(notice);
        const generalAnalysis = publicationNumber
          ? analysesByPublicationNumber.get(publicationNumber)
          : undefined;

        return generalAnalysis === undefined
          ? notice
          : { ...notice, generalAnalysis };
      }),
    };
  }

  toListDto(
    analysis: TenderGeneralAnalysisRecord | null,
  ): TenderGeneralAnalysisListDto | null {
    if (analysis === null) {
      return null;
    }

    return {
      status: analysis.status,
      summary: analysis.summary,
      complexityScore: analysis.complexityScore,
      opportunityScore: analysis.opportunityScore,
      generalRecommendation: analysis.generalRecommendation,
      confidenceScore: analysis.confidenceScore,
      analyzedAt: analysis.analyzedAt,
    };
  }

  private extractPublicationNumberFromNotice(
    notice: TedNotice,
  ): string | undefined {
    const value = notice.publicationNumber ?? notice['publication-number'];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === 'number') {
      const text = String(value);

      if (/^\d{9,12}$/.test(text)) {
        return `${text.slice(0, -4)}-${text.slice(-4)}`;
      }
    }

    return undefined;
  }

  private getTenderPublicationKeys(tender: {
    id?: string;
    publicationNumber?: string;
    sourceNoticeId?: string;
  }): string[] {
    const keys = [
      tender.publicationNumber,
      tender.sourceNoticeId,
      tender.id,
    ].filter(
      (value): value is string => value !== undefined && value.length > 0,
    );

    return Array.from(new Set(keys));
  }

  toDetailDto(
    analysis: TenderGeneralAnalysisRecord | null,
  ): TenderGeneralAnalysisDetailDto | null {
    if (analysis === null) {
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

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      this.isRecord(error) && (error.code === 11000 || error.code === '11000')
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  // private mapGeneralRecommendation(
  //   goNoGo: GeneralGoNoGo,
  // ): TenderGeneralRecommendation {
  //   if (goNoGo === 'GO') {
  //     return TenderGeneralRecommendation.PROMISING;
  //   }
  //
  //   if (goNoGo === 'NO_GO') {
  //     return TenderGeneralRecommendation.NOT_RECOMMENDED;
  //   }
  //
  //   return TenderGeneralRecommendation.REVIEW;
  // }

  private getSafeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'unknown error';
  }
}
