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
import {
  GeneralGoNoGo,
  GeneralTenderAnalysisInput,
} from '@/openai/dto/openai-analysis.dto';
import { TenderDocument, TenderModel } from '../tenders/schemas';

type TenderGeneralAnalysisRecord = TenderGeneralAnalysis & { _id?: unknown };

@Injectable()
export class TenderGeneralAnalysisService {
  constructor(private readonly tenderAnalysisService: TenderAnalysisService) {}

  async ensureAnalyzedForTender(tender: TenderDocument): Promise<void> {
    const tenderObjectId = tender._id as mongoose.Types.ObjectId;
    const existing = await TenderGeneralAnalysisModel.findOne({
      tender: tenderObjectId,
    }).exec();

    if (existing) {
      return;
    }

    let analysis: TenderGeneralAnalysisDocument;

    try {
      analysis = await TenderGeneralAnalysisModel.create({
        tender: tenderObjectId,
        status: TenderGeneralAnalysisStatus.PROCESSING,
      });
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
      const execution = await this.tenderAnalysisService.analyzeTenderGeneral(
        this.buildAnalysisInput(tender),
      );
      const result = execution.result;

      await TenderGeneralAnalysisModel.findByIdAndUpdate(
        analysis._id,
        {
          $set: {
            status: TenderGeneralAnalysisStatus.DONE,
            resultJson: result,
            summary: result.summary,
            complexityScore: result.complexityScore,
            opportunityScore: result.opportunityScore,
            generalRecommendation: this.mapGeneralRecommendation(
              result.generalGoNoGo,
            ),
            confidenceScore: result.confidenceScore,
            sourceHash: execution.sourceHash,
            promptVersion: execution.promptVersion,
            model: execution.model,
            analyzedAt: new Date(),
          },
          $unset: {
            errorMessage: '',
          },
        },
        { new: true },
      ).exec();
    } catch (error: unknown) {
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
      model: analysis.model,
      promptVersion: analysis.promptVersion,
    };
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

  private buildAnalysisInput(
    tender: TenderDocument,
  ): GeneralTenderAnalysisInput {
    return {
      tender: {
        id: tender.id,
        publicationNumber: tender.publicationNumber ?? null,
        title: tender.title ?? null,
        buyerName: tender.buyerName ?? null,
        country: tender.buyerCountry ?? null,
        procedureType: tender.procedureType ?? null,
        noticeType: tender.noticeType ?? null,
        publicationDate: tender.publicationDate ?? null,
        deadlineDate: tender.submissionDeadline ?? null,
        cpvCodes: this.extractCpvCodes(tender),
      },
      documents: [],
    };
  }

  private extractCpvCodes(tender: TenderDocument): string[] {
    const codes = [
      ...(tender.cpvCodes ?? []),
      ...(tender.classificationCpv ?? []),
    ]
      .map((cpv) => this.extractCpvCode(cpv))
      .filter((code): code is string => code !== null);

    return Array.from(new Set(codes));
  }

  private extractCpvCode(cpv: unknown): string | null {
    if (typeof cpv === 'string') {
      return cpv;
    }

    if (!this.isRecord(cpv)) {
      return null;
    }

    return typeof cpv.code === 'string' ? cpv.code : null;
  }

  private mapGeneralRecommendation(
    goNoGo: GeneralGoNoGo,
  ): TenderGeneralRecommendation {
    if (goNoGo === 'GO') {
      return TenderGeneralRecommendation.PROMISING;
    }

    if (goNoGo === 'NO_GO') {
      return TenderGeneralRecommendation.NOT_RECOMMENDED;
    }

    return TenderGeneralRecommendation.NEEDS_REVIEW;
  }

  private getSafeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'unknown error';
  }
}
