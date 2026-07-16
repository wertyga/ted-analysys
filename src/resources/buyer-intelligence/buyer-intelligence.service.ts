import {
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import { CpvService } from '@/resources/cpv/cpv.service';
import {
  AwardTender,
  AwardTenderDocument,
  AwardTenderModel,
} from '@/resources/award-tender/schemas';
import {
  BuyerDocument,
  BuyerModel,
  BuyerStats,
  BuyerTopCountryStats,
} from '@/resources/buyer/schemas';
import {
  Contractor,
  ContractorDocument,
  ContractorModel,
} from '@/resources/contractor/schemas';
import { TenderGeneralAnalysisStatus } from '@/resources/tender-analysis/schemas';
import { Tender, TenderModel } from '@/resources/tenders/schemas';
import { TMongoId } from '@/types';
import {
  getSafeErrorMessage,
  getMongoRelationObjectIdArray,
  getNormalizedStringArray,
  getString,
  isRecord,
  QueueAsyncConcurrency,
  sleep,
  toNullableFiniteNumber,
  toOptionalIsoString,
  filterModel,
  isMongoId,
} from '@/utils';
import {
  BUYER_INTELLIGENCE_PROMPT,
  BUYER_INTELLIGENCE_PROMPT_VERSION,
} from './buyer-intelligence.prompt';
import {
  BuyerIntelligence,
  BuyerIntelligenceDocument,
  BuyerIntelligenceModel,
  BuyerIntelligenceSerializable,
} from './schemas';
import {
  BuyerIntelligenceAiPayload,
  BuyerIntelligenceCpvPayload,
} from './buyer-intelligence.types';
import { buildTenderDeepCompanyFitSystemPrompt } from '@/resources/tender-deep-analysis/tender-deep-company-fit.prompt';
import { DEEP_COMPANY_FIT_LLM_JSON_SCHEMA } from '@/openai/schemas/deep-analysis';
import { BUYER_INTELLIGENCE_LLM_JSON_SCHEMA } from '@/openai/schemas/buyer-intelligence';
import fs from 'node:fs';
import { getAwardTenderAwardValueEur } from '@/resources/buyer/buyer-utils';
import { TENDER_ANALYSIS_CONFIG } from '@/config/tender-analysis.config';
import { createHash } from 'crypto';
import { GENERAL_TENDER_ANALYSIS_PROMPT_VERSION } from '@/resources/tender-analysis/general-tender-analysis.prompt';

const DEFAULT_RECENT_TENDERS_LIMIT = 30;

@Injectable()
export class BuyerIntelligenceService {
  private readonly buyerIntelligenceQueue = new QueueAsyncConcurrency(20);

  constructor(
    private readonly llmAnalysisService: LlmAnalysisService,
    private readonly cpvService: CpvService,
  ) {}

  private getActivityLevel(
    tendersLast12Months: number,
  ): BuyerIntelligenceAiPayload['signals']['activityLevel'] {
    if (tendersLast12Months === 0) {
      return 'inactive';
    }

    if (tendersLast12Months < 5) {
      return 'low';
    }

    if (tendersLast12Months < 20) {
      return 'medium';
    }

    return 'high';
  }

  private getSupplierCountriesPayload(
    stats?: BuyerStats,
    contractorsById?: Map<string, Contractor>,
  ): BuyerIntelligenceAiPayload['stats']['supplierCountries'] {
    if (!stats || !contractorsById) {
      return [];
    }

    const countsByCountry = new Map<string, number>();

    for (const supplier of stats.topSuppliers) {
      const contractor = contractorsById.get(supplier.winner.toString());
      const country = contractor?.countries?.[0];

      if (!country) {
        continue;
      }

      countsByCountry.set(
        country,
        (countsByCountry.get(country) ?? 0) + supplier.wins,
      );
    }

    return Array.from(countsByCountry.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
  }

  private getTopSuppliersPayload(
    stats?: BuyerStats,
    contractorsById?: Map<string, Contractor>,
  ): BuyerIntelligenceAiPayload['stats']['topSuppliers'] {
    if (!stats || !contractorsById) {
      return [];
    }

    return (
      stats.topSuppliers
        // .filter((s) => s.wins > 1)
        .map((supplier) => {
          const contractor = contractorsById.get(supplier.winner.toString());

          return {
            name: contractor?.name ?? '',
            country: contractor?.countries?.[0],
            wins: supplier.wins,
          };
        })
    );
  }

  private getTopCpvCodesPayload(
    topCpvCodes: BuyerStats['topCpvCodes'],
    cpvByCode: Map<string, BuyerIntelligenceCpvPayload>,
  ): BuyerIntelligenceAiPayload['stats']['topCpvCodes'] {
    const groupedCounts = new Map<string, number>();

    for (const item of topCpvCodes) {
      const groupCode = this.getCpvGroupCode(item.code);

      if (!groupCode) {
        continue;
      }

      groupedCounts.set(
        groupCode,
        (groupedCounts.get(groupCode) ?? 0) + item.count,
      );
    }

    return Array.from(groupedCounts.entries()).flatMap(([code, count]) => {
      const cpv = cpvByCode.get(code);

      return cpv ? [{ cpv, count }] : [];
    });
  }

  private getRecentTendersPayload(
    tenders: Tender[],
    cpvByCode: Map<string, BuyerIntelligenceCpvPayload>,
  ): BuyerIntelligenceAiPayload['recentTenders'] {
    return tenders.map((tender) => ({
      publicationDate: toOptionalIsoString(tender.publicationDate),
      estimatedValueEur: toNullableFiniteNumber(tender.estimatedValueEur),
      cpvCodes: this.getCpvNames(tender.cpvCodes ?? [], cpvByCode),
      countries: tender.placeOfPerformanceCountries ?? [],
      contractNature: tender.contractNature,
      procedureType: tender.procedureType,
    }));
  }

  private getRecentAwardTendersPayload(
    awardTenders: AwardTender[],
    cpvByCode: Map<string, BuyerIntelligenceCpvPayload>,
  ): BuyerIntelligenceAiPayload['recentAwardTenders'] {
    return awardTenders.map((awardTender) => {
      const awardedValueEurByWinnerId = new Map<string, number>();

      for (const lot of awardTender.lots ?? []) {
        const winnerId = lot.winner?.toString();
        const awardedValueEur = toNullableFiniteNumber(lot.awardValueEur);

        if (!winnerId || awardedValueEur === null) {
          continue;
        }

        awardedValueEurByWinnerId.set(
          winnerId,
          (awardedValueEurByWinnerId.get(winnerId) ?? 0) + awardedValueEur,
        );
      }

      return {
        publicationDate: toOptionalIsoString(awardTender.publicationDate),
        awardedValueEur: toNullableFiniteNumber(
          getAwardTenderAwardValueEur(awardTender as AwardTenderDocument),
        ),
        cpvCodes: this.getCpvNames(awardTender.cpvCodes ?? [], cpvByCode),
        winners: awardTender.winners.map((contractor: ContractorDocument) => {
          return {
            name: contractor.name ?? '',
            country: contractor.countries?.[0],
            city: contractor.cities?.[0],
            awardedValueEur: toNullableFiniteNumber(
              awardedValueEurByWinnerId.get(contractor._id.toString()),
            ),
          };
        }),
      };
    });
  }

  private getTopCountries(stats?: BuyerStats): BuyerTopCountryStats[] {
    if (!stats || stats.topCountries.length === 0) {
      return [];
    }

    return stats.topCountries;
  }

  async buildAiPayload(params: {
    buyerId: TMongoId;
    recentTendersLimit?: number;
  }): Promise<BuyerIntelligenceAiPayload> {
    const recentTendersLimit =
      params.recentTendersLimit ?? DEFAULT_RECENT_TENDERS_LIMIT;
    const last12Months = new Date();
    last12Months.setFullYear(last12Months.getFullYear() - 1);

    const [buyer, recentTenders, recentAwardTenders, tendersLast12Months] =
      await Promise.all([
        BuyerModel.findById(params.buyerId).lean(),
        TenderModel.find({
          leadBuyers: params.buyerId,
          submissionDeadline: { $gte: new Date() },
        })
          .sort({ publicationDate: -1, _id: -1 })
          .limit(recentTendersLimit)
          .lean(),
        AwardTenderModel.find({ leadBuyers: params.buyerId })
          .sort({ publicationDate: -1, _id: -1 })
          .limit(recentTendersLimit)
          .populate('winners', 'name countries cities')
          .lean(),
        TenderModel.countDocuments({
          leadBuyers: params.buyerId,
          publicationDate: { $gte: last12Months },
        }),
      ]);

    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    const topSupplierIds = getMongoRelationObjectIdArray(
      buyer.stats?.topSuppliers.map((supplier) => supplier.winner) ?? [],
    );
    const topSupplierContractors = topSupplierIds.length
      ? await ContractorModel.find({ _id: { $in: topSupplierIds } } as never)
          .select('name countries')
          .lean()
      : [];

    const contractorsById = new Map(
      topSupplierContractors.map((contractor) => [
        contractor._id.toString(),
        contractor,
      ]),
    );

    const stats = buyer.stats;
    const intelligence = buyer.intelligence;
    const groupedTopCpvCodes =
      stats?.topCpvCodes.flatMap((item) => {
        const groupCode = this.getCpvGroupCode(item.code);

        return groupCode ? [groupCode] : [];
      }) ?? [];
    const cpvByCode = this.getCpvByCode([
      ...groupedTopCpvCodes,
      ...recentTenders.flatMap((tender) => tender.cpvCodes ?? []),
      ...recentAwardTenders.flatMap(
        (awardTender) => awardTender.cpvCodes ?? [],
      ),
    ]);

    return {
      buyer: {
        name: buyer.name,
        country: buyer.address?.country,
        countrySub: buyer.address?.countrySub,
        city: buyer.address?.city,
        legalTypes: buyer.legalTypes ?? [],
        mainActivities: buyer.mainActivities ?? [],
        websites: buyer.websites ?? [],
        profiles: buyer.profiles ?? [],
      },
      stats: {
        tendersCount: stats?.tendersCount ?? 0,
        awardTendersCount: stats?.awardTendersCount ?? 0,
        tendersLast12Months,
        totalEstimatedValueEur: toNullableFiniteNumber(
          stats?.totalEstimatedValueEur,
        ),
        totalAwardedValueEur: toNullableFiniteNumber(
          stats?.totalAwardedValueEur,
        ),
        avgEstimatedValueEur: toNullableFiniteNumber(
          stats?.avgEstimatedValueEur,
        ),
        avgAwardedValueEur: toNullableFiniteNumber(stats?.avgAwardedValueEur),
        topCpvCodes: stats
          ? this.getTopCpvCodesPayload(stats.topCpvCodes, cpvByCode)
          : [],
        topCountries: this.getTopCountries(stats),
        topSuppliers: this.getTopSuppliersPayload(stats, contractorsById),
        supplierCountries: this.getSupplierCountriesPayload(
          stats,
          contractorsById,
        ),
        repeatSupplierRate: intelligence?.repeatSupplierRate,
        localSupplierRate: intelligence?.localSupplierRate,
      },
      signals: {
        activityLevel: this.getActivityLevel(tendersLast12Months),
        incumbentRisk: intelligence?.incumbentRisk ?? 'unknown',
        localSupplierSignal: intelligence?.localSupplierSignal ?? 'unknown',
      },
      recentTenders: this.getRecentTendersPayload(recentTenders, cpvByCode),
      recentAwardTenders: this.getRecentAwardTendersPayload(
        recentAwardTenders,
        cpvByCode,
      ),
    };
  }

  private getCpvByCode(
    codes: string[],
  ): Map<string, BuyerIntelligenceCpvPayload> {
    return new Map(
      this.cpvService.resolveRawCodes(codes).map((cpv) => [
        cpv.code,
        {
          code: cpv.code,
          name: cpv.name,
        },
      ]),
    );
  }

  private getCpvGroupCode(code: string): string | null {
    return /^\d{8}$/.test(code) ? `${code.slice(0, 2)}000000` : null;
  }

  private getCpvNames(
    codes: string[],
    cpvByCode: Map<string, BuyerIntelligenceCpvPayload>,
  ): string[] {
    return codes.flatMap((code) => {
      const cpv = cpvByCode.get(code);

      return cpv ? [cpv.name] : [];
    });
  }

  async generateAndSaveBuyerIntelligence(params: {
    buyerId: TMongoId;
    recentTendersLimit?: number;
  }): Promise<BuyerIntelligenceDocument> {
    try {
      const payload = await this.buildAiPayload(params);

      const prompt = [
        BUYER_INTELLIGENCE_PROMPT,
        'Return JSON only. The JSON must match this schema:',
        JSON.stringify(BUYER_INTELLIGENCE_LLM_JSON_SCHEMA),
      ].join('\n\n');

      const context = [
        'BUYER INTELLIGENCE PAYLOAD',
        JSON.stringify(payload, null, 2),
      ].join('\n');

      const response =
        await this.llmAnalysisService.createGeneralJsonResponse(
          prompt,
          context,
        );

      const result = this.normalizeBuyerIntelligenceResult(response);

      return BuyerIntelligenceModel.findOneAndUpdate(
        { buyer: params.buyerId },
        {
          $set: {
            ...result,
            status: TenderGeneralAnalysisStatus.DONE,
            errorMessage: null,
          },
          $setOnInsert: {
            buyer: params.buyerId,
          },
        },
        { returnDocument: 'after', upsert: true },
      ).exec();
    } catch (error: unknown) {
      return BuyerIntelligenceModel.findOneAndUpdate(
        { buyer: params.buyerId },
        {
          $set: {
            status: TenderGeneralAnalysisStatus.FAILED,
            errorMessage: getSafeErrorMessage(error),
          },
          $setOnInsert: {
            buyer: params.buyerId,
          },
        },
        { returnDocument: 'after', upsert: true },
      ).exec();
    }
  }

  private async getBuyerStatsVersion(buyerId: TMongoId): Promise<number> {
    const buyer = await BuyerModel.findById(buyerId)
      .select('statsVersion')
      .lean();

    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    return buyer.statsVersion ?? 1;
  }

  async ensureBuyerIntelligence(params: {
    buyerId: TMongoId;
    recentTendersLimit?: number;
  }): Promise<BuyerIntelligenceDocument> {
    const existing = await BuyerIntelligenceModel.findOne({
      buyer: params.buyerId,
      status: { $ne: TenderGeneralAnalysisStatus.FAILED },
    }).populate('buyer');
    const buyerStatsVersion = await this.getBuyerStatsVersion(params.buyerId);

    const needToCalculate = this.hasBuyerIntelligenceToBeRecalculated(
      buyerStatsVersion,
      existing,
    );

    if (existing && !needToCalculate) {
      const isInProcess =
        existing.status === TenderGeneralAnalysisStatus.PROCESSING;

      if (isInProcess) {
        return existing;
      }

      return existing;
    }

    const analysis = await BuyerIntelligenceModel.findOneAndUpdate(
      { buyer: params.buyerId },
      {
        $set: {
          status: TenderGeneralAnalysisStatus.PROCESSING,
          sourceHash: this.getBuyerIntelSourceHash(buyerStatsVersion),
          errorMessage: null,
        },
        $setOnInsert: {
          buyer: params.buyerId,
        },
      },
      { returnDocument: 'after', upsert: true },
    );

    void this.buyerIntelligenceQueue.push(() =>
      this.generateAndSaveBuyerIntelligence(params),
    );

    return analysis;
  }

  async getFinishedBuyerIntelligence(params: {
    buyerId: TMongoId;
    recentTendersLimit?: number;
  }): Promise<BuyerIntelligenceDocument> {
    let analysis = await this.ensureBuyerIntelligence(params);
    const waitUntil = Date.now() + TENDER_ANALYSIS_CONFIG.wait.timeoutMs;

    while (analysis.status !== TenderGeneralAnalysisStatus.DONE) {
      if (Date.now() >= waitUntil) {
        throw new RequestTimeoutException(
          `Buyer intelligence for buyer ${params.buyerId} was not finished within 10 minutes`,
        );
      }

      analysis = (await BuyerIntelligenceModel.findById(
        analysis._id,
      )) as BuyerIntelligenceDocument;

      if (analysis.status === TenderGeneralAnalysisStatus.FAILED) {
        throw new Error(
          `Buyer intelligence for buyer ${params.buyerId} failed: ${
            analysis.errorMessage ?? 'unknown error'
          }`,
        );
      }

      await sleep(TENDER_ANALYSIS_CONFIG.wait.intervalMs);
    }

    return analysis;
  }

  private hasBuyerIntelligenceToBeRecalculated(
    buyerStatsVersion: number,
    buyerIntel: BuyerIntelligenceSerializable | null | undefined,
  ) {
    if (!buyerIntel) {
      return true;
    }

    if (isMongoId(buyerIntel.buyer)) {
      return false;
    }

    return (
      buyerIntel.sourceHash !== this.getBuyerIntelSourceHash(buyerStatsVersion)
    );
  }

  private normalizeBuyerIntelligenceResult(
    value: unknown,
  ): Omit<
    BuyerIntelligence,
    'buyer' | 'status' | 'errorMessage' | 'sourceHash'
  > {
    if (!isRecord(value)) {
      throw new Error('Buyer intelligence result must be a JSON object');
    }

    const procurementProfile = isRecord(value.procurementProfile)
      ? value.procurementProfile
      : {};

    const marketBehavior = isRecord(value.marketBehavior)
      ? value.marketBehavior
      : {};

    const supplierLandscape = isRecord(value.supplierLandscape)
      ? value.supplierLandscape
      : {};

    const buyerDecisionSignals = isRecord(value.buyerDecisionSignals)
      ? value.buyerDecisionSignals
      : {};

    return {
      summary: getString(value, 'summary'),

      procurementProfile: {
        overview: getString(procurementProfile, 'overview'),
        highlights: getNormalizedStringArray(procurementProfile.highlights),
      },

      marketBehavior: {
        overview: getString(marketBehavior, 'overview'),
        highlights: getNormalizedStringArray(marketBehavior.highlights),
      },

      supplierLandscape: {
        overview: getString(supplierLandscape, 'overview'),
        highlights: getNormalizedStringArray(supplierLandscape.highlights),
      },

      historicalTrends: getNormalizedStringArray(value.historicalTrends),
      dataLimitations: getNormalizedStringArray(value.dataLimitations),
      buyerDecisionSignals: {
        idealSupplierProfile: getNormalizedStringArray(
          buyerDecisionSignals.idealSupplierProfile,
        ),
        supplierPatternSignals: getNormalizedStringArray(
          buyerDecisionSignals.supplierPatternSignals,
        ),
        competitionSignals: getNormalizedStringArray(
          buyerDecisionSignals.competitionSignals,
        ),
        dataConfidence: this.getBuyerDecisionSignalsDataConfidence(
          buyerDecisionSignals.dataConfidence,
        ),
      },
    };
  }

  private getBuyerDecisionSignalsDataConfidence(
    value: unknown,
  ): 'low' | 'medium' | 'high' {
    return value === 'medium' || value === 'high' ? value : 'low';
  }

  private getBuyerIntelSourceHash(buyerVersion: number) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          buyerVersion,
          promptVersion: BUYER_INTELLIGENCE_PROMPT_VERSION,
          provider: this.llmAnalysisService.getGeneralAnalysisProvider(),
          model: this.llmAnalysisService.getGeneralAnalysisModel(),
        }),
      )
      .digest('hex');
  }
}


