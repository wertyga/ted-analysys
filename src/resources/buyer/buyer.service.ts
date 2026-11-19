import {
  NationalAwardTenderDocument,
  NationalAwardTenderModel,
} from '@/resources/national-tenders/core/schemas/national-award-tender.schema';

/** TED and national awards, newest first. */
function mergeAwardsByDate<T extends { publicationDate?: Date }>(
  ted: T[],
  national: unknown[],
): T[] {
  return [...ted, ...(national as T[])].sort(
    (a, b) =>
      new Date(b.publicationDate ?? 0).getTime() -
      new Date(a.publicationDate ?? 0).getTime(),
  );
}

/** `AwardTenderModel.serializeList` + the national source fields. */
function serializeAnyAwardList(award: unknown) {
  const record = award as {
    source?: string;
    sourceUrl?: string;
    country?: string;
  };
  const list = AwardTenderModel.serializeList(award as never);

  return record.source
    ? {
        ...list,
        source: record.source,
        sourceUrl: record.sourceUrl,
        country: record.country,
      }
    : list;
}

import {
  NATIONAL_TENDER_POPULATE,
  serializeNationalTenderList,
} from '@/resources/national-tenders/core/national-tender.serializer';
import {
  NationalTender,
  NationalTenderModel,
} from '@/resources/national-tenders/core/schemas/national-tender.schema';
import mongoose, { QueryFilter, SortOrder, Types } from 'mongoose';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { BuyerNormalized, BuyerNormalizer } from './buyer.normalizer';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import {
  BuyerCodeName,
  BuyerDocument,
  BuyerModel,
  BuyerStats,
} from './schemas';
import {
  getMongoRelationObjectIdArray,
  awardTenderPopulateFields,
  getPaginationMeta,
  tenderPopulateFields,
  getUniqArray,
} from '@/utils';

import { TenderLot, TenderModel } from '@/resources/tenders/schemas';
import {
  AwardTenderDocument,
  AwardTenderLot,
  AwardTenderModel,
} from '@/resources/award-tender/schemas';
import { TMongoId } from '@/types';
import {
  BuyerIntelligenceCalculation,
  calculateBuyerIntelligenceSignals,
  getDatesBuyerTendersStats,
  getEmptyBuyerStats,
  getMoneyBuyerTendersStats,
  getTopBuyerTendersStats,
} from './buyer-utils';
import { ContractorModel } from '@/resources/contractor/schemas';
import { getLegalTypes, getMainActivities } from '@/resources/codelist';
import {
  BuyerListRequestDto,
  BuyerListSortOrder,
} from './dto/buyer-list-request.dto';
import { AwardTenderService } from '@/resources/award-tender/award-tender.service';
import { MAX_AWARD_TENDER_FOR_CONTRACTOR_OR_BUYER } from '@/config/award-tender.config';

type BuyerTenderMeta = {
  stats: BuyerStats;
  intelligence: BuyerIntelligenceCalculation;
  statsVersion: number;
};

const BUYER_RECENT_TENDERS_LIMIT = 10000;

type BuyerMeta = {
  countries: Array<{ country: string; count: number }>;
  cpvCodes: Array<{ cpvCode: string; count: number }>;
  legalTypes: Array<{ code: string; name: string; count: number }>;
};

@Injectable()
export class BuyerService {
  normalizer = new BuyerNormalizer();

  constructor(
    @Inject(forwardRef(() => AwardTenderService))
    private awardTenderService: AwardTenderService,
  ) {}

  async getBuyers({
    q,
    countries,
    cpvCodes,
    sortBy,
    sortOrder,
    page,
    limit,
    legalTypes,
  }: BuyerListRequestDto) {
    const query: QueryFilter<BuyerDocument> = {};

    if (countries?.length) {
      query['address.country'] = { $in: countries };
    }

    if (cpvCodes?.length) {
      query.cpvCodes = { $in: cpvCodes };
    }

    if (legalTypes?.length) {
      query['legalTypes.code'] = { $in: legalTypes };
    }

    const trimmedQuery = q?.trim();

    if (trimmedQuery) {
      const searchPattern = new RegExp(this.escapeRegExp(trimmedQuery), 'i');

      query.$or = [
        { name: searchPattern },
        { identifier: searchPattern },
        { organisationIdentifierBuyer: searchPattern },
        { 'contact.email': searchPattern },
        { 'address.city': searchPattern },
        { 'address.country': searchPattern },
      ];
    }

    const pagination = getPaginationMeta({ page, limit });
    const sort: Record<string, SortOrder> = sortBy
      ? {
          [sortBy]: sortOrder === BuyerListSortOrder.ASC ? 1 : -1,
          name: 1,
          _id: 1,
        }
      : { name: 1, _id: 1 };
    const [buyers, totalCount] = await Promise.all([
      BuyerModel.find(query)
        .sort(sort)
        .skip(pagination.skip)
        .limit(pagination.limit),
      BuyerModel.countDocuments(query),
    ]);

    return {
      totalCount,
      buyers,
    };
  }

  async getBuyerMeta(): Promise<BuyerMeta> {
    const [countries, cpvCodes, legalTypes] = await Promise.all([
      BuyerModel.aggregate<{ country: string; count: number }>([
        {
          $match: {
            'address.country': { $type: 'string', $ne: '' },
          },
        },
        {
          $group: {
            _id: '$address.country',
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
      BuyerModel.aggregate<{ cpvCode: string; count: number }>([
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
      BuyerModel.aggregate<{ code: string; name: string; count: number }>([
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

  mergeCodeNameOptions(
    ...options: Array<Array<BuyerCodeName | string> | null | undefined>
  ): BuyerCodeName[] {
    return Array.from(
      new Map(
        options
          .flatMap((items) => items ?? [])
          .map((item) => {
            if (typeof item === 'string') {
              return [item, { code: item, name: item }] as const;
            }

            return [item.code, item] as const;
          })
          .filter(([code]) => code),
      ).values(),
    );
  }

  private async getWinnerCountriesById(
    awardTenders: AwardTenderDocument[],
  ): Promise<Map<string, string[]>> {
    const winnerIds = getMongoRelationObjectIdArray(
      awardTenders.flatMap((awardTender) => awardTender.winners ?? []),
    );

    if (!winnerIds.length) {
      return new Map();
    }

    const contractorFilter: Record<string, unknown> = {
      _id: { $in: winnerIds },
    };
    const contractors = await ContractorModel.find(contractorFilter as never)
      .select('countries')
      .lean();

    return new Map(
      contractors.map((contractor) => [
        contractor._id.toString(),
        contractor.countries ?? [],
      ]),
    );
  }

  async getTendersBuyerMetaAndIntelligence(
    buyer: BuyerDocument,
    buyerCountry?: string,
  ): Promise<BuyerTenderMeta> {
    const tenderSelectFields =
      'publicationDate estimatedValueEur cpvCodes placeOfPerformanceCountries nonLeadBuyers leadBuyers';
    const awardTenderSelectFields = `${tenderSelectFields} awardValueEur lots winners`;
    const activeTenderFilter = {
      submissionDeadline: { $gte: new Date() },
    };

    const [
      nonLeadTenders,
      tedLeadTenders,
      nonLeadAwardTenders,
      tedLeadAwardTenders,
      nationalLeadTenders,
      nationalLeadAwardTenders,
    ] = await Promise.all([
      TenderModel.find({
        ...activeTenderFilter,
        nonLeadBuyers: buyer._id,
      })
        .select(tenderSelectFields)
        .lean(),
      TenderModel.find({
        ...activeTenderFilter,
        leadBuyers: buyer._id,
      })
        .select(tenderSelectFields)
        .lean(),
      AwardTenderModel.find({
        nonLeadBuyers: buyer._id,
      })
        .select(awardTenderSelectFields)
        .lean(),
      AwardTenderModel.find({
        leadBuyers: buyer._id,
      })
        .select(awardTenderSelectFields)
        .lean(),
      // National tenders count as the buyer's own (lead) tenders.
      NationalTenderModel.find({
        ...activeTenderFilter,
        leadBuyers: buyer._id,
      })
        .select(
          'publicationDate estimatedValueEur cpvCodes placeOfPerformanceCountries leadBuyers',
        )
        .lean(),
      // National results count as the buyer's own awards.
      NationalAwardTenderModel.find({
        leadBuyers: buyer._id,
      })
        .select(awardTenderSelectFields)
        .lean(),
    ]);
    const leadAwardTenders = [
      ...tedLeadAwardTenders,
      ...nationalLeadAwardTenders,
    ] as unknown as typeof tedLeadAwardTenders;
    const leadTenders = [
      ...tedLeadTenders,
      ...nationalLeadTenders,
    ] as typeof tedLeadTenders;

    const tendersCount = leadTenders.length;
    const awardTendersCount = leadAwardTenders.length;
    const participatedTendersCount = nonLeadTenders.length;
    const participatedAwardTendersCount = nonLeadAwardTenders.length;

    const hasStatsVersionToBeCounted =
      buyer.stats &&
      (buyer.stats?.tendersCount !== tendersCount ||
        buyer.stats?.awardTendersCount !== awardTendersCount ||
        buyer.stats?.participatedTendersCount !== participatedTendersCount ||
        buyer.stats?.participatedAwardTendersCount !==
          participatedAwardTendersCount);

    const stats: BuyerStats = {
      tendersCount,
      awardTendersCount,
      participatedTendersCount,
      participatedAwardTendersCount,
      ...getDatesBuyerTendersStats(leadTenders, leadAwardTenders),
      ...getMoneyBuyerTendersStats(leadTenders, leadAwardTenders),
      ...getTopBuyerTendersStats(leadTenders, leadAwardTenders),
    };

    const winnerCountriesById =
      await this.getWinnerCountriesById(leadAwardTenders);

    const intelligence = calculateBuyerIntelligenceSignals({
      buyerCountry,
      stats,
      awardTenders: leadAwardTenders,
      winnerCountriesById,
    });

    return {
      stats,
      intelligence,
      statsVersion: hasStatsVersionToBeCounted
        ? buyer.statsVersion + 1
        : buyer.statsVersion,
    };
  }

  async refreshBuyersTenderMeta(
    buyersIds: TMongoId[],
  ): Promise<BuyerDocument[]> {
    const uniqueIds = Array.from(new Set(buyersIds)).filter((id) =>
      Types.ObjectId.isValid(id),
    );

    const buyers = await BuyerModel.find({
      _id: { $in: uniqueIds as any },
    }).select('address.country intelligence');

    if (!buyers.length) {
      return [];
    }

    const buyersMetas = await Promise.all(
      buyers.map((buyer) => {
        return this.getTendersBuyerMetaAndIntelligence(
          buyer,
          buyer.address?.country,
        );
      }),
    );

    return Promise.all(
      buyersMetas.map((bm, i) => {
        return BuyerModel.findByIdAndUpdate(
          buyers[i]._id,
          {
            $set: {
              stats: bm.stats,
              intelligence: bm.intelligence,
              statsVersion: bm.statsVersion,
            },
          },
          { returnDocument: 'after' },
        );
      }),
    ) as unknown as BuyerDocument[];
  }

  async upsertPureBuyersFromTEDNotice(
    notice: TedNotice,
  ): Promise<{ leadIds: string[]; nonLeadIds: string[] }> {
    const normalizedBuyers =
      this.normalizer.normalizeBuyersFromTEDNotice(notice);

    const map = new Map<string, { buyer: BuyerDocument; isLead: boolean }>();

    for (let i = 0; i < normalizedBuyers.length; i++) {
      const normBuyer = normalizedBuyers[i];
      const buyer = await this.upsertPureNormalizedBuyer(normBuyer);

      map.set(buyer._id.toString(), { buyer, isLead: normBuyer.isLead });
    }

    return Array.from(map.values()).reduce(
      (acc, b) => {
        if (b.isLead) {
          acc.leadIds.push(b.buyer._id);
        } else {
          acc.nonLeadIds.push(b.buyer._id);
        }
        return acc;
      },
      { leadIds: [] as any[], nonLeadIds: [] as any[] },
    );
  }

  private async upsertPureNormalizedBuyer(
    normalizedBuyer: BuyerNormalized,
  ): Promise<BuyerDocument> {
    const identifiers = normalizedBuyer.identifiers;
    const identityFilter =
      identifiers.length && normalizedBuyer.address.country
        ? {
            identifiers: { $in: identifiers },
            'address.country': normalizedBuyer.address.country,
          }
        : {
            name: normalizedBuyer.name,
            'address.country': normalizedBuyer.address.country,
          };

    const existingBuyer: BuyerDocument | null =
      await BuyerModel.findOne(identityFilter);

    if (!existingBuyer) {
      return BuyerModel.create({
        ...normalizedBuyer,
        cpvCodes: normalizedBuyer.isLead ? normalizedBuyer.cpvCodes : [],
        legalTypes: getLegalTypes(normalizedBuyer.legalTypes),
        mainActivities: getMainActivities(normalizedBuyer.mainActivities),
        stats: getEmptyBuyerStats(),
      });
    }

    const getLastExisting = (...values: Array<string | null | undefined>) =>
      values.findLast((value) => value?.trim()) ?? '';

    const address = {
      street: getLastExisting(
        existingBuyer.address?.street,
        normalizedBuyer.address.street,
      ),
      postCode: getLastExisting(
        existingBuyer.address?.postCode,
        normalizedBuyer.address.postCode,
      ),
      city: getLastExisting(
        existingBuyer.address?.city,
        normalizedBuyer.address.city,
      ),
      country: getLastExisting(
        existingBuyer.address?.country,
        normalizedBuyer.address.country,
      ),
      countrySub: getLastExisting(
        existingBuyer.address?.countrySub,
        normalizedBuyer.address.countrySub,
      ),
    };
    const contact: BuyerDocument['contact'] = {
      contactPoint: getLastExisting(
        existingBuyer.contact?.contactPoint,
        normalizedBuyer.contact.contactPoint,
      ),
      person: getLastExisting(
        existingBuyer.contact?.person,
        normalizedBuyer.contact.person,
      ),
      email: getLastExisting(
        existingBuyer.contact?.email,
        normalizedBuyer.contact.email,
      ),
      phone: getLastExisting(
        existingBuyer.contact?.phone,
        normalizedBuyer.contact.phone,
      ),
      fax: getLastExisting(
        existingBuyer.contact?.fax,
        normalizedBuyer.contact.fax,
      ),
      website: getLastExisting(
        existingBuyer.contact?.website,
        normalizedBuyer.contact.website,
      ),
      gateway: getLastExisting(
        existingBuyer.contact?.gateway,
        normalizedBuyer.contact.gateway,
      ),
    };

    return BuyerModel.findByIdAndUpdate(
      existingBuyer._id,
      {
        $set: {
          name: getLastExisting(existingBuyer.name, normalizedBuyer.name),
          identifiers: Array.from(
            new Set([
              ...(existingBuyer.identifiers ?? []),
              ...normalizedBuyer.identifiers,
            ]),
          ),
          contact,
          address,
          legalTypes: this.mergeCodeNameOptions(
            existingBuyer.legalTypes,
            getLegalTypes(normalizedBuyer.legalTypes),
          ),
          mainActivities: this.mergeCodeNameOptions(
            existingBuyer.mainActivities,
            getMainActivities(normalizedBuyer.mainActivities),
          ),
          profiles: getUniqArray(
            existingBuyer.profiles,
            normalizedBuyer.profiles,
          ),
          gateways: getUniqArray(
            existingBuyer.gateways,
            normalizedBuyer.gateways,
          ),
          websites: getUniqArray(
            existingBuyer.websites,
            normalizedBuyer.websites,
          ),
          cpvCodes: normalizedBuyer.isLead
            ? getUniqArray(existingBuyer.cpvCodes, normalizedBuyer.cpvCodes)
            : existingBuyer.cpvCodes,
          countries: getUniqArray(
            existingBuyer.countries,
            normalizedBuyer.countries,
          ),
        },
      },
      { returnDocument: 'after' },
    ).then((buyer) => {
      if (!buyer) {
        throw new Error(`Buyer ${existingBuyer._id} disappeared during update`);
      }

      return buyer;
    });
  }

  /**
   * Finds or creates the shared `Buyer` for a buyer of a national tender,
   * with the same identity rule as TED (identifiers + country, else name).
   */
  async upsertNationalBuyer(input: {
    name: string;
    identifiers: string[];
    country: string;
    street?: string;
    postCode?: string;
    city?: string;
    countrySub?: string;
    email?: string;
    website?: string;
    cpvCodes: string[];
  }): Promise<BuyerDocument> {
    return this.upsertPureNormalizedBuyer({
      name: input.name,
      identifiers: input.identifiers,
      address: {
        street: input.street ?? '',
        postCode: input.postCode ?? '',
        city: input.city ?? '',
        country: input.country,
        countrySub: input.countrySub ?? '',
      },
      contact: {
        contactPoint: '',
        person: '',
        email: input.email ?? '',
        phone: '',
        fax: '',
        website: input.website ?? '',
        gateway: '',
      },
      legalTypes: [],
      mainActivities: [],
      profiles: [],
      gateways: [],
      websites: input.website ? [input.website] : [],
      cpvCodes: input.cpvCodes,
      countries: [input.country],
      isLead: true,
    });
  }

  async getBuyerDetails(buyerId: string) {
    return BuyerModel.findById(buyerId).populate('stats.topSuppliers.winner');
  }

  async getRecentTenders(buyerId: string) {
    const [tenders, nationalTenders] = await Promise.all([
      TenderModel.find({
        $or: [{ leadBuyers: buyerId }, { nonLeadBuyers: buyerId }],
        submissionDeadline: { $gte: new Date() },
      })
        .sort({ publicationDate: -1 })
        .limit(BUYER_RECENT_TENDERS_LIMIT)
        .populate(tenderPopulateFields)
        .exec(),
      NationalTenderModel.find({
        leadBuyers: buyerId,
        submissionDeadline: { $gte: new Date() },
      })
        .sort({ publicationDate: -1 })
        .limit(BUYER_RECENT_TENDERS_LIMIT)
        .populate(NATIONAL_TENDER_POPULATE)
        .lean<NationalTender[]>()
        .exec(),
    ]);

    // TED and national tenders of the buyer, newest first.
    return [
      ...tenders.map((tender) => ({
        date: tender.publicationDate,
        dto: TenderModel.serializeList(tender),
      })),
      ...nationalTenders.map((tender) => ({
        date: tender.publicationDate,
        dto: serializeNationalTenderList(tender),
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
      )
      .slice(0, BUYER_RECENT_TENDERS_LIMIT)
      .map(({ dto }) => dto) as ReturnType<typeof TenderModel.serializeList>[];
  }

  async getRecentAwardTenders(buyerId: string) {
    const query = {
      $or: [{ leadBuyers: buyerId }, { nonLeadBuyers: buyerId }],
    };
    const [awardTenders, nationalAwardTenders] = await Promise.all([
      AwardTenderModel.find(query)
        .sort({ publicationDate: -1 })
        .limit(MAX_AWARD_TENDER_FOR_CONTRACTOR_OR_BUYER)
        .populate(awardTenderPopulateFields)
        .exec(),
      NationalAwardTenderModel.find(query)
        .sort({ publicationDate: -1 })
        .limit(MAX_AWARD_TENDER_FOR_CONTRACTOR_OR_BUYER)
        .populate(awardTenderPopulateFields)
        .exec(),
    ]);

    return mergeAwardsByDate(awardTenders, nationalAwardTenders)
      .slice(0, MAX_AWARD_TENDER_FOR_CONTRACTOR_OR_BUYER)
      .map(serializeAnyAwardList);
  }

  async getAwardTendersByBuyerId(
    buyerId: string,
    pagination: { page?: number; limit?: number } = {},
  ) {
    if (!Types.ObjectId.isValid(buyerId)) {
      throw new BadRequestException('Invalid buyer id');
    }

    const query: QueryFilter<AwardTenderDocument> = {
      $or: [{ leadBuyers: buyerId }, { nonLeadBuyers: buyerId }],
    };

    const { skip, limit } = getPaginationMeta(pagination);
    // TED and national results, newest first: take skip+limit of each, merge.
    const [awardTenders, nationalAwardTenders, tedCount, nationalCount] =
      await Promise.all([
        AwardTenderModel.find(query)
          .sort({ publicationDate: -1, _id: -1 })
          .limit(skip + limit)
          .populate(awardTenderPopulateFields)
          .exec(),
        NationalAwardTenderModel.find(
          query as QueryFilter<NationalAwardTenderDocument>,
        )
          .sort({ publicationDate: -1, _id: -1 })
          .limit(skip + limit)
          .populate(awardTenderPopulateFields)
          .exec(),
        AwardTenderModel.countDocuments(query),
        NationalAwardTenderModel.countDocuments(
          query as QueryFilter<NationalAwardTenderDocument>,
        ),
      ]);

    return {
      totalCount: tedCount + nationalCount,
      awardTenders: mergeAwardsByDate(awardTenders, nationalAwardTenders)
        .slice(skip, skip + limit)
        .map(serializeAnyAwardList),
    };
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
