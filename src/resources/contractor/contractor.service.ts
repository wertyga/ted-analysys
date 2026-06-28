import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { AwardTenderModel } from '@/resources/award-tender/schemas';

export type WinnerNormalized = Omit<
  Contractor,
  '_id' | 'awardTenders' | 'createdAt' | 'updatedAt' | 'cpvCodes'
>;

@Injectable()
export class ContractorService {
  private async getContractorAwardSummaryByIds(contractorIds: string[]) {
    const objectIds = contractorIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (!objectIds.length) {
      return new Map<string, { awardTendersCount: number; totalAwardedValueEur: number }>();
    }

    const stats = await AwardTenderModel.aggregate<{
      _id: Types.ObjectId;
      awardTendersCount: number;
      totalAwardedValueEur: number;
    }>([
      { $unwind: '$winners' },
      { $match: { winners: { $in: objectIds } } },
      {
        $group: {
          _id: '$winners',
          awardTendersCount: { $sum: 1 },
          totalAwardedValueEur: { $sum: { $ifNull: ['$awardValueEur', 0] } },
        },
      },
    ]);

    return new Map(
      stats.map((item) => [
        item._id.toString(),
        {
          awardTendersCount: item.awardTendersCount,
          totalAwardedValueEur: item.totalAwardedValueEur,
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
    const statsByContractorId = await this.getContractorAwardSummaryByIds(
      contractorIds,
    );

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
        { identifier: searchPattern },
        { email: searchPattern },
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

    const contractor = await ContractorModel.findById(id)
      .populate({
        path: 'awardTenders',
        options: { sort: { publicationDate: -1, _id: -1 } },
        populate: [
          { path: 'buyer' },
          { path: 'winners' },
        ],
      })
      .exec();

    if (!contractor) {
      throw new NotFoundException('Contractor not found');
    }

    const statsByContractorId = await this.getContractorAwardSummaryByIds([id]);
    const stats = statsByContractorId.get(id) ?? {
      awardTendersCount: 0,
      totalAwardedValueEur: 0,
    };

    return {
      ...ContractorModel.serializeDetail(contractor),
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
      ContractorModel.countDocuments({ email: { $type: 'string', $ne: '' } }),
      ContractorModel.countDocuments({ 'awardTenders.0': { $exists: true } }),
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
      cpvCodes: string[];
    },
  ): Promise<ContractorDocument[]> {
    return Promise.all(
      winners.map((t) => this.upsertAwardWinner(t, options)),
    ).then((ws) => ws.filter(Boolean) as ContractorDocument[]);
  }

  async upsertAwardWinner(
    winner: WinnerNormalized,
    {
      awardTenderId,
      cpvCodes,
    }: {
      awardTenderId: string;
      cpvCodes: string[];
    },
  ): Promise<ContractorDocument | null> {
    try {
      const email = normalizeEmail(winner.email);
      const normalized = {
        ...winner,
        email,
      };
      const identityFilter = this.buildWinnerIdentityFilter(normalized);

      return await ContractorModel.findOneAndUpdate(
        identityFilter,
        {
          $set: normalized,
          $addToSet: {
            awardTenders: awardTenderId,
            cpvCodes: { $each: cpvCodes },
          },
        },
        { returnDocument: 'after', upsert: true },
      );
    } catch (e) {
      await logger.error('upsertAwardWinner::Error', e);

      return null;
    }
  }

  private buildWinnerIdentityFilter(
    winner: WinnerNormalized,
  ): QueryFilter<ContractorDocument> {
    const filters: QueryFilter<ContractorDocument>[] = [];

    if (winner.email) {
      filters.push({ email: winner.email });
    }

    if (winner.identifier) {
      filters.push({ identifier: winner.identifier });
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
