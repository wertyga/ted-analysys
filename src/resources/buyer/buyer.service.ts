import mongoose, { QueryFilter, Types } from 'mongoose';
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
import { BuyerListRequestDto } from './dto/buyer-list-request.dto';
import { AwardTenderService } from '@/resources/award-tender/award-tender.service';

type BuyerTenderMeta = {
  stats: BuyerStats;
  intelligence: BuyerIntelligenceCalculation;
  statsVersion: number;
};

const BUYER_RECENT_TENDERS_LIMIT = 10;

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
    page,
    limit,
  }: BuyerListRequestDto) {
    const query: QueryFilter<BuyerDocument> = {};

    if (countries?.length) {
      query['address.country'] = { $in: countries };
    }

    if (cpvCodes?.length) {
      query.cpvCodes = { $in: cpvCodes };
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
    const [buyers, totalCount] = await Promise.all([
      BuyerModel.find(query)
        .sort({ name: 1, _id: 1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      BuyerModel.countDocuments(query),
    ]);

    return {
      totalCount,
      buyers: buyers.map((buyer) => BuyerModel.serializeList(buyer)),
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

  private mergeCodeNameOptions(
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

    const [nonLeadTenders, leadTenders, nonLeadAwardTenders, leadAwardTenders] =
      await Promise.all([
        TenderModel.find({
          nonLeadBuyers: buyer._id,
        })
          .select(tenderSelectFields)
          .lean(),
        TenderModel.find({
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
      ]);

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
    const buyers = await BuyerModel.find({
      _id: { $in: buyersIds as any },
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

    existingBuyer.set({
      name: getLastExisting(existingBuyer.name, normalizedBuyer.name),
      identifier: getLastExisting(
        ...existingBuyer.identifiers,
        ...normalizedBuyer.identifiers,
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
      profiles: getUniqArray(existingBuyer.profiles, normalizedBuyer.profiles),
      gateways: getUniqArray(existingBuyer.gateways, normalizedBuyer.gateways),
      websites: getUniqArray(existingBuyer.websites, normalizedBuyer.websites),
      cpvCodes: normalizedBuyer.isLead
        ? getUniqArray(existingBuyer.cpvCodes, normalizedBuyer.cpvCodes)
        : existingBuyer.cpvCodes,
      countries: getUniqArray(
        existingBuyer.countries,
        normalizedBuyer.countries,
      ),
    });

    return existingBuyer.save();
  }

  async getBuyerDetails(buyerId: string) {
    return BuyerModel.findById(buyerId).populate('stats.topSuppliers.winner');
  }

  async getRecentTenders(buyerId: string) {
    const tenders = await TenderModel.find({
      $or: [{ leadBuyers: buyerId }, { nonLeadBuyers: buyerId }],
    })
      .sort({ publicationDate: -1, _id: -1 })
      .limit(BUYER_RECENT_TENDERS_LIMIT)
      .populate(tenderPopulateFields)
      .exec();

    return tenders.map(TenderModel.serializeList);
  }

  async getRecentAwardTenders(buyerId: string) {
    const awardTenders = await AwardTenderModel.find({
      $or: [{ leadBuyers: buyerId }, { nonLeadBuyers: buyerId }],
    })
      .sort({ publicationDate: -1, _id: -1 })
      .limit(BUYER_RECENT_TENDERS_LIMIT)
      .populate(awardTenderPopulateFields)
      .exec();

    return awardTenders.map(AwardTenderModel.serializeList);
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
    const [awardTenders, totalCount] = await Promise.all([
      AwardTenderModel.find(query)
        .sort({ publicationDate: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate(awardTenderPopulateFields)
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

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
