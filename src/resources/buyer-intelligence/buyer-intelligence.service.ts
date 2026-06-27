import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AwardTender,
  AwardTenderModel,
} from '@/resources/award-tender/schemas';
import { BuyerModel, BuyerStats } from '@/resources/buyer/schemas';
import {
  Contractor,
  ContractorDocument,
  ContractorModel,
} from '@/resources/contractor/schemas';
import { Tender, TenderModel } from '@/resources/tenders/schemas';
import { TMongoId } from '@/types';
import {
  getMongoRelationObjectIdArray,
  toNullableFiniteNumber,
  toOptionalIsoString,
} from '@/utils';
import { BuyerIntelligenceAiPayload } from './buyer-intelligence.types';

const DEFAULT_RECENT_TENDERS_LIMIT = 30;

@Injectable()
export class BuyerIntelligenceService {
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

  private getTopSuppliersPayload(
    stats: BuyerStats,
    contractorsById: Map<string, Contractor>,
  ): BuyerIntelligenceAiPayload['stats']['topSuppliers'] {
    return stats.topSuppliers.map((supplier) => {
      const contractor = contractorsById.get(supplier.winner.toString());

      return {
        name: contractor?.name ?? supplier.winner.toString(),
        country: contractor?.countries?.[0],
        wins: supplier.wins,
        totalAwardedValueEur: toNullableFiniteNumber(
          supplier.totalAwardedValueEur,
        ),
      };
    });
  }

  private getRecentTendersPayload(
    tenders: Tender[],
  ): BuyerIntelligenceAiPayload['recentTenders'] {
    return tenders.map((tender) => ({
      title: tender.title ?? tender.titleProc,
      publicationDate: toOptionalIsoString(tender.publicationDate),
      estimatedValueEur: toNullableFiniteNumber(tender.estimatedValueEur),
      cpvCodes: tender.cpvCodes ?? [],
      countries: tender.placeOfPerformanceCountries ?? [],
      contractNature: tender.contractNature,
      procedureType: tender.procedureType,
    }));
  }

  private getRecentAwardTendersPayload(
    awardTenders: AwardTender[],
  ): BuyerIntelligenceAiPayload['recentAwardTenders'] {
    return awardTenders.map((awardTender) => ({
      title: awardTender.title ?? awardTender.titleProc,
      publicationDate: toOptionalIsoString(awardTender.publicationDate),
      awardedValueEur: toNullableFiniteNumber(awardTender.awardValueEur),
      cpvCodes: awardTender.cpvCodes ?? [],
      winners: awardTender.winners.map((contractor: ContractorDocument) => {
        return {
          name: contractor.name ?? '',
          country: contractor.countries?.[0],
          city: contractor.cities?.[0],
        };
      }),
    }));
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
        TenderModel.find({ buyer: params.buyerId })
          .sort({ publicationDate: -1, _id: -1 })
          .limit(recentTendersLimit)
          .lean(),
        AwardTenderModel.find({ buyer: params.buyerId })
          .sort({ publicationDate: -1, _id: -1 })
          .limit(recentTendersLimit)
          .populate('winners', 'name countries cities')
          .lean(),
        TenderModel.countDocuments({
          buyer: params.buyerId,
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
        topCpvCodes: stats?.topCpvCodes ?? [],
        topCountries: stats?.topCountries ?? [],
        topSuppliers: stats
          ? this.getTopSuppliersPayload(stats, contractorsById)
          : [],
        repeatSupplierRate: toNullableFiniteNumber(
          intelligence?.repeatSupplierRate,
        ),
        localSupplierRate: toNullableFiniteNumber(
          intelligence?.localSupplierRate,
        ),
      },
      signals: {
        activityLevel: this.getActivityLevel(tendersLast12Months),
        incumbentRisk: intelligence?.incumbentRisk ?? 'unknown',
        localSupplierSignal: intelligence?.localSupplierSignal ?? 'unknown',
      },
      recentTenders: this.getRecentTendersPayload(recentTenders),
      recentAwardTenders: this.getRecentAwardTendersPayload(recentAwardTenders),
    };
  }
}
