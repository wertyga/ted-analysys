import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { logger, normalizeEmail } from '@/utils';
import {
  Contractor,
  ContractorDocument,
  ContractorListDto,
  ContractorModel,
  ContractorSerializable,
} from './schemas';
import { QueryFilter, Types } from 'mongoose';
import { getPaginationMeta } from '@/utils';
import { ContractorListRequestDto } from './dto/contractor-list-request.dto';
import { ContractorSearchRequestDto } from './dto/contractor-search-request.dto';
import {
  AwardTenderDocument,
  AwardTenderModel,
} from '@/resources/award-tender/schemas';

type ContractorAwardMeta = {
  stats: {
    lastAwardWinDate: Date | null;
    totalAwardAmountEur: number;
    awardTendersCount: number;
    awardLotsCount: number;
  };
  cpvCodes: string[];
};

export type WinnerNormalized = Partial<
  Omit<Contractor, '_id' | 'createdAt' | 'updatedAt' | 'stats' | 'cpvCodes'>
>;

@Injectable()
export class ContractorService {
  private async getContractorAwardSummaryByIds(contractorIds: string[]) {
    const metaByContractorId =
      await this.getContractorAwardMetaByIds(contractorIds);

    return new Map(
      Array.from(metaByContractorId.entries()).map(([contractorId, meta]) => [
        contractorId,
        {
          awardTendersCount: meta.stats.awardTendersCount,
          totalAwardedValueEur: meta.stats.totalAwardAmountEur,
        },
      ]),
    );
  }

  private async getContractorAwardMetaByIds(
    contractorIds: string[],
  ): Promise<Map<string, ContractorAwardMeta>> {
    const winnerIds = contractorIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (!winnerIds.length) {
      return new Map();
    }

    const winnerIdSet = new Set(
      winnerIds.map((winnerId) => winnerId.toString()),
    );
    const metaAccumulator = new Map<
      string,
      {
        lastAwardWinDate: Date | null;
        totalAwardAmountEur: number;
        awardTenderIds: Set<string>;
        awardLotsCount: number;
        cpvCodes: Set<string>;
      }
    >();

    const awardTenderFilter: QueryFilter<AwardTenderDocument> = {
      'lots.winner': { $in: winnerIds } as never,
    };

    const awardTenders = await AwardTenderModel.find(awardTenderFilter)
      .select('_id publicationDate lots')
      .lean();

    for (const awardTender of awardTenders) {
      const awardTenderId = awardTender._id.toString();

      for (const lot of awardTender.lots ?? []) {
        const winnerId = lot.winner?.toString();

        if (!winnerId || !winnerIdSet.has(winnerId)) {
          continue;
        }

        const current = metaAccumulator.get(winnerId) ?? {
          lastAwardWinDate: null,
          totalAwardAmountEur: 0,
          awardTenderIds: new Set<string>(),
          awardLotsCount: 0,
          cpvCodes: new Set<string>(),
        };

        const publicationDate = awardTender.publicationDate ?? null;

        if (
          publicationDate &&
          (!current.lastAwardWinDate ||
            publicationDate.getTime() > current.lastAwardWinDate.getTime())
        ) {
          current.lastAwardWinDate = publicationDate;
        }

        if (
          typeof lot.awardValueEur === 'number' &&
          Number.isFinite(lot.awardValueEur)
        ) {
          current.totalAwardAmountEur += lot.awardValueEur;
        }

        current.awardTenderIds.add(awardTenderId);
        current.awardLotsCount += 1;

        [
          ...(lot.mainClassification ?? []),
          ...(lot.additionalClassifications ?? []),
        ].forEach((cpvCode) => {
          if (cpvCode) {
            current.cpvCodes.add(cpvCode);
          }
        });

        metaAccumulator.set(winnerId, current);
      }
    }

    return new Map(
      Array.from(metaAccumulator.entries()).map(([contractorId, meta]) => [
        contractorId,
        {
          cpvCodes: Array.from(meta.cpvCodes),
          stats: {
            lastAwardWinDate: meta.lastAwardWinDate,
            totalAwardAmountEur: meta.totalAwardAmountEur,
            awardTendersCount: meta.awardTenderIds.size,
            awardLotsCount: meta.awardLotsCount,
          },
        },
      ]),
    );
  }

  private async serializeListWithAwardSummary(
    contractors: ContractorSerializable[],
  ): Promise<ContractorListDto[]> {
    const serializedContractors = contractors.map((contractor) =>
      ContractorModel.serializeList(contractor),
    );
    const contractorIds = serializedContractors.flatMap((contractor) =>
      contractor._id ? [contractor._id.toString()] : [],
    );
    const statsByContractorId =
      await this.getContractorAwardSummaryByIds(contractorIds);

    return serializedContractors.map((contractor) => ({
      ...contractor,
      awardTendersCount:
        statsByContractorId.get(contractor._id?.toString() ?? '')
          ?.awardTendersCount ?? 0,
      totalAwardedValueEur:
        statsByContractorId.get(contractor._id?.toString() ?? '')
          ?.totalAwardedValueEur ?? 0,
    }));
  }

  async searchContractors({
    cpvCodes,
    countries,
    page,
    limit,
  }: ContractorListRequestDto) {
    const query: QueryFilter<ContractorDocument> = {};

    if (cpvCodes?.length) {
      query.cpvCodes = { $in: cpvCodes };
    }

    if (countries?.length) {
      query.countries = { $in: countries };
    }

    const pagination = getPaginationMeta({ page, limit });
    const [contractors, totalCount] = await Promise.all([
      ContractorModel.find(query)
        .sort({ name: 1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .exec(),
      ContractorModel.countDocuments(query),
    ]);

    return {
      totalCount,
      contractors: await this.serializeListWithAwardSummary(contractors),
    };
  }

  async searchContractorsByQuery({
    q,
    page,
    limit,
  }: ContractorSearchRequestDto) {
    const trimmedQuery = q.trim();
    const pagination = getPaginationMeta({ page, limit });

    if (!trimmedQuery) {
      return {
        totalCount: 0,
        contractors: [],
      };
    }

    const searchPattern = new RegExp(this.escapeRegExp(trimmedQuery), 'i');
    const query: QueryFilter<ContractorDocument> = {
      $or: [
        { name: searchPattern },
        { identifiers: searchPattern },
        { emails: searchPattern },
        { countries: searchPattern },
        { countrySubs: searchPattern },
        { cities: searchPattern },
        { postCodes: searchPattern },
        { internetAddresses: searchPattern },
      ],
    };

    const [contractors, totalCount] = await Promise.all([
      ContractorModel.find(query)
        .sort({ name: 1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .exec(),
      ContractorModel.countDocuments(query),
    ]);

    return {
      totalCount,
      contractors: await this.serializeListWithAwardSummary(contractors),
    };
  }

  async getContractorById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid contractor id');
    }

    const contractor = await ContractorModel.findById(id).exec();

    if (!contractor) {
      throw new NotFoundException('Contractor not found');
    }

    const [awardTenders, statsByContractorId] = await Promise.all([
      AwardTenderModel.find({
        winners: new Types.ObjectId(id),
      })
        .sort({ publicationDate: -1, _id: -1 })
        .populate('buyer')
        .populate('winners')
        .exec(),
      this.getContractorAwardSummaryByIds([id]),
    ]);
    const stats = statsByContractorId.get(id) ?? {
      awardTendersCount: 0,
      totalAwardedValueEur: 0,
    };

    return {
      ...ContractorModel.serializeDetail(contractor),
      awardTenders: awardTenders.map((awardTender) =>
        AwardTenderModel.serializeList(awardTender),
      ),
      ...stats,
    };
  }

  async getContractorAwardTenders(
    id: string,
    pagination: { page?: number; limit?: number } = {},
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid contractor id');
    }

    const contractorExists = await ContractorModel.exists({
      _id: new Types.ObjectId(id),
    } as never);

    if (!contractorExists) {
      throw new NotFoundException('Contractor not found');
    }

    const query = {
      winners: new Types.ObjectId(id),
    };
    const { skip, limit } = getPaginationMeta(pagination);
    const [awardTenders, totalCount] = await Promise.all([
      AwardTenderModel.find(query)
        .sort({ publicationDate: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('buyer')
        .populate('winners')
        .exec(),
      AwardTenderModel.countDocuments(query),
    ]);

    return {
      totalCount,
      awardTenders: awardTenders.map((awardTender) =>
        AwardTenderModel.serializeList(awardTender),
      ),
    };
  }

  async getContractorStats() {
    const [
      totalCount,
      withEmailCount,
      withAwardTendersCount,
      byCountries,
      byCpvCodes,
    ] = await Promise.all([
      ContractorModel.countDocuments({}),
      ContractorModel.countDocuments({ 'emails.0': { $exists: true } }),
      AwardTenderModel.distinct('lots.winner', {
        'lots.winner': { $exists: true, $ne: null },
      }).then((winnerIds) => winnerIds.length),
      ContractorModel.aggregate<{ value: string; count: number }>([
        { $unwind: '$countries' },
        { $match: { countries: { $type: 'string', $ne: '' } } },
        { $group: { _id: '$countries', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 20 },
        { $project: { _id: 0, value: '$_id', count: 1 } },
      ]),
      ContractorModel.aggregate<{ value: string; count: number }>([
        { $unwind: '$cpvCodes' },
        { $match: { cpvCodes: { $type: 'string', $ne: '' } } },
        { $group: { _id: '$cpvCodes', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 20 },
        { $project: { _id: 0, value: '$_id', count: 1 } },
      ]),
    ]);

    return {
      totalCount,
      withEmailCount,
      withoutEmailCount: totalCount - withEmailCount,
      withAwardTendersCount,
      withoutAwardTendersCount: totalCount - withAwardTendersCount,
      byCountries,
      byCpvCodes,
    };
  }

  async upsertListAwardWinners(
    winners: WinnerNormalized[],
    options: {
      awardTenderId: string;
      cpvCodes?: string[];
    },
  ): Promise<ContractorDocument[]> {
    return Promise.all(
      winners.map((t) => this.upsertAwardWinner(t, options)),
    ).then((ws) => ws.filter(Boolean) as ContractorDocument[]);
  }

  async upsertAwardWinner(
    winner: WinnerNormalized,
    _options: {
      awardTenderId?: string;
      cpvCodes?: string[];
    },
  ): Promise<ContractorDocument | null> {
    try {
      const emails = (winner.emails ?? [])
        .map((email) => normalizeEmail(email))
        .filter(Boolean);
      const normalized = {
        ...winner,
        emails,
      };
      const identityFilter = this.buildWinnerIdentityFilter(normalized);

      return ContractorModel.findOneAndUpdate(
        identityFilter,
        {
          $set: normalized,
        },
        { returnDocument: 'after', upsert: true },
      );
    } catch (e) {
      await logger.error('upsertAwardWinner::Error', e);

      return null;
    }
  }

  async refreshContractorsAwardMeta(contractorIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(contractorIds)).filter((id) =>
      Types.ObjectId.isValid(id),
    );

    if (!uniqueIds.length) {
      return;
    }

    const metaByContractorId =
      await this.getContractorAwardMetaByIds(uniqueIds);

    const emptyStats = {
      lastAwardWinDate: null,
      totalAwardAmountEur: 0,
      awardTendersCount: 0,
      awardLotsCount: 0,
    };

    await ContractorModel.bulkWrite(
      uniqueIds.map((contractorId) => {
        const meta = metaByContractorId.get(contractorId);

        return {
          updateOne: {
            filter: { _id: contractorId as never },
            update: {
              $set: {
                cpvCodes: meta?.cpvCodes ?? [],
                stats: meta?.stats ?? emptyStats,
              },
            },
          },
        };
      }),
    );
  }

  private buildWinnerIdentityFilter(
    winner: WinnerNormalized,
  ): QueryFilter<ContractorDocument> {
    const filters: QueryFilter<ContractorDocument>[] = [];

    if (winner.emails?.length) {
      filters.push({ emails: { $in: winner.emails } });
    }

    if (winner.identifiers?.length) {
      filters.push({ identifiers: { $in: winner.identifiers } });
    }

    if (winner.euRegistrationNumber) {
      filters.push({ euRegistrationNumber: winner.euRegistrationNumber });
    }

    if (filters.length === 0) {
      return {
        name: winner.name,
        countries: winner.countries,
        cities: winner.cities,
      };
    }

    return filters.length === 1 ? filters[0] : { $or: filters };
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
