import { NationalAwardTenderModel } from '@/resources/national-tenders/core/schemas/national-award-tender.schema';

/**
 * Spellings of a tax id found in TED contractor identifiers, e.g. NIP
 * 5212935353 → "521-293-53-53", "521-29-35-353", "521 293 53 53",
 * "PL5212935353".
 */
export function taxIdSpellings(digits: string): string[] {
  const spellings = new Set([digits, `PL${digits}`]);

  if (digits.length === 10) {
    const [a, b, c, d] = [
      digits.slice(0, 3),
      digits.slice(3, 6),
      digits.slice(6, 8),
      digits.slice(8),
    ];

    spellings.add(`${a}-${b}-${c}-${d}`);
    spellings.add(`${a} ${b} ${c} ${d}`);
    spellings.add(
      `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 7)}-${digits.slice(7)}`,
    );
  }

  return [...spellings];
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  getLatestDate,
  logger,
  normalizeEmail,
  TPaginationType,
} from '@/utils';
import { Contractor, ContractorDocument, ContractorModel } from './schemas';
import { QueryFilter, Types } from 'mongoose';
import { getPaginationMeta } from '@/utils';
import {
  ContractorListRequestDto,
  ContractorListSortBy,
  ContractorListSortOrder,
} from './dto/contractor-list-request.dto';
import { ContractorSearchRequestDto } from './dto/contractor-search-request.dto';
import {
  AwardTenderDocument,
  AwardTenderLot,
  AwardTenderModel,
} from '@/resources/award-tender/schemas';
import { MAX_AWARD_TENDER_FOR_CONTRACTOR_OR_BUYER } from '@/config/award-tender.config';

type ContractorAwardMeta = {
  stats: {
    lastAwardWinDate: Date | null;
    totalAwardAmountEur: number;
    awardTendersCount: number;
    awardLotsCount: number;
  };
  cpvCodes: string[];
};

type ContractorMeta = {
  countries: Array<{ country: string; count: number }>;
  cpvCodes: Array<{ cpvCode: string; count: number }>;
  legalTypes: Array<{ code: string; name: string; count: number }>;
};

export type WinnerNormalized = Partial<
  Omit<Contractor, '_id' | 'createdAt' | 'updatedAt' | 'stats' | 'cpvCodes'>
>;

@Injectable()
export class ContractorService {
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

    const [tedAwardTenders, nationalAwardTenders] = await Promise.all([
      AwardTenderModel.find({
        winners: { $in: winnerIds },
      })
        .select('_id publicationDate lots')
        .lean(),
      // National results (BZP etc.) share the contractors collection.
      NationalAwardTenderModel.find({
        winners: { $in: winnerIds },
      })
        .select('_id publicationDate lots contractConclusionDates')
        .lean(),
    ]);
    const awardTenders = [
      ...tedAwardTenders,
      ...nationalAwardTenders,
    ] as unknown as typeof tedAwardTenders;

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

        const times = [
          ...(awardTender.contractConclusionDates ?? []),
          current.lastAwardWinDate,
          awardTender.publicationDate,
        ].filter(Boolean) as Date[];

        current.lastAwardWinDate = getLatestDate(times);
        current.totalAwardAmountEur += lot.awardValueEur ?? 0;

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
      Array.from(metaAccumulator.entries()).map(([contractorId, meta]) => {
        return [
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
        ];
      }),
    );
  }

  async searchContractors({
    cpvCodes,
    countries,
    q,
    sortBy = ContractorListSortBy.TOTAL_AWARD_AMOUNT_EUR,
    sortOrder,
    page,
    limit,
  }: ContractorListRequestDto) {
    const query: QueryFilter<ContractorDocument> = {
      name: { $exists: true, $ne: '' },
    };

    const trimmedQuery = q?.trim();
    if (trimmedQuery) {
      const searchPattern = new RegExp(this.escapeRegExp(trimmedQuery), 'i');
      query.$or = [
        { name: searchPattern },
        { identifiers: searchPattern },
        { emails: searchPattern },
        { countries: searchPattern },
        { countrySubs: searchPattern },
        { cities: searchPattern },
        { postCodes: searchPattern },
        { internetAddresses: searchPattern },
      ];
    }

    if (cpvCodes?.length) {
      query.cpvCodes = { $in: cpvCodes };
    }

    if (countries?.length) {
      query.countries = { $in: countries };
    }

    const pagination = getPaginationMeta({ page, limit });
    const [contractors, totalCount] = await Promise.all([
      ContractorModel.find(query)
        .sort({
          [sortBy]: sortOrder === ContractorListSortOrder.ASC ? 1 : -1,
          _id: 1,
        })
        .skip(pagination.skip)
        .limit(pagination.limit),
      ContractorModel.countDocuments(query),
    ]);

    return {
      totalCount,
      contractors,
    };
  }

  async getContractorById(id: string): Promise<{
    contractor: ContractorDocument;
    awardTenders: AwardTenderDocument[];
  }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid contractor id');
    }

    const contractor = await ContractorModel.findById(id).exec();

    if (!contractor) {
      throw new NotFoundException('Contractor not found');
    }

    const { awardTenders } = await this.getContractorAwardTenders(id, {
      page: 1,
      limit: MAX_AWARD_TENDER_FOR_CONTRACTOR_OR_BUYER,
    });

    return {
      contractor,
      awardTenders,
    };
  }

  async getContractorAwardTenders(
    id: string,
    pagination: TPaginationType = {},
  ) {
    const query = {
      winners: new Types.ObjectId(id),
    };
    const { skip, limit } = getPaginationMeta(pagination);
    // TED and national results, newest first: take skip+limit of each, merge.
    const [tedAwardTenders, nationalAwardTenders, tedCount, nationalCount] =
      await Promise.all([
        AwardTenderModel.find(query)
          .sort({ publicationDate: -1 })
          .limit(skip + limit)
          .populate('leadBuyers')
          .populate('winners')
          .select('-nonLeadBuyers')
          .exec(),
        NationalAwardTenderModel.find(query)
          .sort({ publicationDate: -1 })
          .limit(skip + limit)
          .populate('leadBuyers')
          .populate('winners')
          .select('-nonLeadBuyers')
          .exec(),
        AwardTenderModel.countDocuments(query),
        NationalAwardTenderModel.countDocuments(query),
      ]);
    const awardTenders = [
      ...tedAwardTenders,
      ...(nationalAwardTenders as unknown as typeof tedAwardTenders),
    ]
      .sort(
        (a, b) =>
          new Date(b.publicationDate ?? 0).getTime() -
          new Date(a.publicationDate ?? 0).getTime(),
      )
      .slice(skip, skip + limit);

    return {
      totalCount: tedCount + nationalCount,
      awardTenders,
    };
  }

  async getContractorStats() {
    const [contractorsCount, awardLotsStats, countries] = await Promise.all([
      ContractorModel.countDocuments({}),
      AwardTenderModel.aggregate<{
        totalAwardAmountEur: number;
        awardLotsCount: number;
      }>([
        { $match: { 'lots.winner': { $exists: true, $ne: null } } },
        { $unwind: '$lots' },
        { $match: { 'lots.winner': { $exists: true, $ne: null } } },
        {
          $group: {
            _id: null,
            awardLotsCount: { $sum: 1 },
            totalAwardAmountEur: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      { $type: '$lots.awardValueEur' },
                      ['double', 'int', 'long', 'decimal'],
                    ],
                  },
                  '$lots.awardValueEur',
                  0,
                ],
              },
            },
          },
        },
        { $project: { _id: 0, totalAwardAmountEur: 1, awardLotsCount: 1 } },
      ]).then(
        ([stats]) =>
          stats ?? {
            totalAwardAmountEur: 0,
            awardLotsCount: 0,
          },
      ),
      ContractorModel.distinct('countries', {
        countries: { $type: 'string', $ne: '' },
      }),
    ]);

    return {
      contractorsCount,
      totalAwardAmountEur: awardLotsStats.totalAwardAmountEur,
      awardLotsCount: awardLotsStats.awardLotsCount,
      countriesCount: countries.length,
    };
  }

  async getContractorMeta(): Promise<ContractorMeta> {
    const [countries, cpvCodes, legalTypes] = await Promise.all([
      ContractorModel.aggregate<{ country: string; count: number }>([
        { $unwind: '$countries' },
        {
          $match: {
            countries: { $type: 'string', $ne: '' },
            name: { $exists: true, $ne: '' },
          },
        },
        {
          $group: {
            _id: '$countries',
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            country: '$_id',
            count: 1,
          },
        },
      ]),
      ContractorModel.aggregate<{ cpvCode: string; count: number }>([
        { $unwind: '$cpvCodes' },
        {
          $match: {
            cpvCodes: { $type: 'string', $ne: '' },
          },
        },
        {
          $group: {
            _id: '$cpvCodes',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1, _id: 1 } },
        {
          $project: {
            _id: 0,
            cpvCode: '$_id',
            count: 1,
          },
        },
      ]),
      ContractorModel.aggregate<{ code: string; name: string; count: number }>([
        { $unwind: '$legalTypes' },
        {
          $match: {
            'legalTypes.code': { $type: 'string', $ne: '' },
            'legalTypes.name': { $type: 'string', $ne: '' },
          },
        },
        {
          $group: {
            _id: {
              code: '$legalTypes.code',
              name: '$legalTypes.name',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1, '_id.code': 1 } },
        {
          $project: {
            _id: 0,
            code: '$_id.code',
            name: '$_id.name',
            count: 1,
          },
        },
      ]),
    ]);

    return {
      countries,
      cpvCodes,
      legalTypes,
    };
  }

  async upsertAwardWinner(
    winner: WinnerNormalized,
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

  /**
   * Finds or creates the shared `Contractor` for a winner of a national
   * result. Matches by tax id in any spelling TED uses (digits, dashes,
   * spaces, VAT prefix) within the country, else by name + city.
   * Only adds data to an existing record, never overwrites it.
   */
  async upsertNationalWinner(winner: {
    name: string;
    nationalId?: string;
    country?: string;
    city?: string;
    postalCode?: string;
  }): Promise<ContractorDocument> {
    const countries = winner.country ? [winner.country] : [];
    const identityFilter: QueryFilter<ContractorDocument> = winner.nationalId
      ? {
          identifiers: { $in: taxIdSpellings(winner.nationalId) },
          ...(countries.length ? { countries: { $in: countries } } : {}),
        }
      : {
          name: winner.name,
          ...(countries.length ? { countries: { $in: countries } } : {}),
          ...(winner.city ? { cities: winner.city } : {}),
        };

    const existing = await ContractorModel.findOne(identityFilter);

    if (existing) {
      return ContractorModel.findByIdAndUpdate(
        existing._id,
        {
          $addToSet: {
            ...(winner.nationalId ? { identifiers: winner.nationalId } : {}),
            ...(countries.length ? { countries: { $each: countries } } : {}),
            ...(winner.city ? { cities: winner.city } : {}),
            ...(winner.postalCode ? { postCodes: winner.postalCode } : {}),
          },
          ...(existing.name ? {} : { $set: { name: winner.name } }),
        },
        { returnDocument: 'after' },
      ) as Promise<ContractorDocument>;
    }

    return ContractorModel.create({
      name: winner.name,
      identifiers: winner.nationalId ? [winner.nationalId] : [],
      countries,
      cities: winner.city ? [winner.city] : [],
      postCodes: winner.postalCode ? [winner.postalCode] : [],
      legalTypes: [],
      cpvCodes: [],
      stats: {
        lastAwardWinDate: null,
        totalAwardAmountEur: 0,
        awardTendersCount: 0,
        awardLotsCount: 0,
      },
    });
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

    await Promise.all(
      uniqueIds.map((contractorId) => {
        const meta = metaByContractorId.get(contractorId);

        return ContractorModel.findByIdAndUpdate(contractorId, {
          $set: {
            cpvCodes: meta?.cpvCodes ?? [],
            stats: meta?.stats ?? emptyStats,
          },
        });
      }),
    );

    // await ContractorModel.bulkWrite(
    //   uniqueIds.map((contractorId) => {
    //     const meta = metaByContractorId.get(contractorId);
    //
    //     return {
    //       updateOne: {
    //         filter: { _id: contractorId as never },
    //         update: {
    //           $set: {
    //             cpvCodes: meta?.cpvCodes ?? [],
    //             stats: meta?.stats ?? emptyStats,
    //           },
    //         },
    //       },
    //     };
    //   }),
    // );
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
