import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';

import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import {
  OPTIONAL_TENDER_UNSET_FIELDS,
  TendersService,
} from '@/resources/tenders/tenders.service';
import {
  AwardTenderModel,
  AwardTenderDocument,
  AwardTenderLot,
} from './schemas';
import {
  ContractorService,
  WinnerNormalized,
} from '@/resources/contractor/contractor.service';
import {
  awardTenderPopulateFields,
  getBooleanArrayValue,
  getPaginationMeta,
  getStringValue,
  getStringArrayValue,
  getUniqArray,
} from '@/utils';
import { QueryFilter, Types } from 'mongoose';
import {
  AwardTenderNormalizer,
  NormalizedAwardTenderLot,
} from './award-tender.normalizer';
import {
  getAwardDate,
  sanitizeLotAwardValues,
  sanitizeTenderAwardValue,
} from './utils';
import { BuyerService } from '@/resources/buyer/buyer.service';
import { BuyerModel } from '@/resources/buyer/schemas';
import fs from 'node:fs';
import { ContractorDocument } from '@/resources/contractor/schemas';
import { TedSearchFilters } from '@/resources/ted-search/ted.search.filters';
import { TedTenderSearchRequestDto } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { CurrencyExchangeRatesService } from '@/resources/currency-exchange-rates/currency-exchange-rates.service';
import {
  AwardTenderFiltersRequestDto,
  AwardTenderListRequestDto,
  AwardTenderSortBy,
  AwardTenderSortOrder,
} from './dto/award-tender-list-request.dto';

export type AwardTenderPureSearchFilters = Pick<
  TedTenderSearchRequestDto,
  'cpvCodes' | 'placeOfPerformance' | 'procedureType' | 'contractNature'
>;

const AWARD_TENDER_PURE_LIST_SELECT = [
  '_id',
  'id',
  'title',
  'titleProc',
  'contractNature',
  'placeOfPerformanceCountries',
  'awardValue',
  'awardValueEur',
];

const AWARD_LIST_SELECT = [
  'id',
  'title',
  'titleProc',
  'awardDate',
  'awardValueEur',
  'placeOfPerformanceCountries',
  'leadBuyers',
  'nonLeadBuyers',
  'winners',
];

const AWARD_LIST_POPULATE = [
  { path: 'leadBuyers', select: 'name' },
  { path: 'nonLeadBuyers', select: 'name' },
  { path: 'winners', select: 'name' },
];

type AwardListRef = { _id: Types.ObjectId; name?: string };

type AwardListLeanItem = {
  id: string;
  title?: string;
  titleProc?: string;
  awardDate?: Date | null;
  awardValueEur?: number | null;
  placeOfPerformanceCountries?: string[];
  leadBuyers?: AwardListRef[];
  nonLeadBuyers?: AwardListRef[];
  winners?: AwardListRef[];
};

export interface SaveAwardTedTendersResult {
  saved: number;
  updated: number;
  skipped: number;
  changedTenders: AwardTenderDocument[];
}

export interface SaveAwardTedTendersOptions {
  updateExisting?: boolean;
  skipExistingByPublicationNumber?: boolean;
}

// const LEGACY_AWARD_TENDER_UNSET_FIELDS = [
//   'additionalClassificationLot',
//   'buyerCity',
//   'buyerCountry',
//   'buyerEmail',
//   'buyerIdentifier',
//   'buyerInternetAddress',
//   'buyerMainActivities',
//   'buyerName',
//   'buyerProfile',
//   'descriptionLot',
//   'internalLotIdentifiers',
//   'mainClassificationLot',
//   'titleLot',
// ] as const;
//
// const OPTIONAL_AWARD_TENDER_UNSET_FIELDS = [
//   'noticeSubtype',
//   'noticeVersion',
//   'description',
//   'submissionDeadline',
//   'plannedEndDate',
//   'contractNature',
//   'isFrameworkAgreement',
// ] as const;

@Injectable()
export class AwardTenderService {
  normalizer = new AwardTenderNormalizer();
  private readonly tedSearchFilters: TedSearchFilters;

  constructor(
    @Inject(forwardRef(() => TendersService))
    private readonly tendersService: TendersService,
    private readonly contractorService: ContractorService,
    @Inject(forwardRef(() => BuyerService))
    private readonly buyerService: BuyerService,
    private readonly currencyExchangeRatesService: CurrencyExchangeRatesService,
  ) {
    this.tedSearchFilters = new TedSearchFilters(
      this.currencyExchangeRatesService,
    );
  }

  async searchAwardTendersLocal(
    tenderId: string,
    pagination: { page?: number; limit?: number } = {},
  ) {
    const tender: TenderDocument | null = await TenderModel.findOne({
      id: tenderId,
    });
    if (!tender) {
      throw new NotFoundException('Tender not found');
    }

    const query: QueryFilter<AwardTenderDocument> = {
      cpvCodes: { $in: tender.cpvCodes as string[] },
      contractNature: tender.contractNature,
    };

    const { skip, limit } = getPaginationMeta(pagination);
    const [savedTenders, totalCount] = await Promise.all([
      AwardTenderModel.find(query)
        .sort({ publicationDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate(awardTenderPopulateFields)
        .exec(),
      AwardTenderModel.countDocuments(query),
    ]);

    return {
      totalNoticeCount: totalCount,
      notices: savedTenders.map((tender) =>
        AwardTenderModel.serializeList(tender),
      ),
    };
  }

  async searchAwardTendersLocalPure(
    filters: AwardTenderPureSearchFilters = {},
    pagination: { page?: number; limit?: number } = {},
  ) {
    const query = (await this.tedSearchFilters.buildLocalTenderQuery(
      filters,
    )) as QueryFilter<AwardTenderDocument>;

    const { skip, limit } = getPaginationMeta(pagination);
    const [awardTenders, totalCount] = await Promise.all([
      AwardTenderModel.find(query)
        .select(AWARD_TENDER_PURE_LIST_SELECT)
        .sort({ publicationDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      AwardTenderModel.countDocuments(query),
    ]);

    return {
      totalNoticeCount: totalCount,
      notices: awardTenders,
    };
  }

  async listAwards(query: AwardTenderListRequestDto) {
    const sortBy = query.sortBy ?? AwardTenderSortBy.AWARD_DATE;
    const direction = query.sortOrder === AwardTenderSortOrder.ASC ? 1 : -1;
    const sortField =
      sortBy === AwardTenderSortBy.VALUE ? 'awardValueEur' : 'awardDate';
    // Zero award values are placeholders, they go to the end with nulls
    const hasSortValue =
      sortBy === AwardTenderSortBy.VALUE
        ? { awardValueEur: { $gt: 0 } }
        : { awardDate: { $ne: null } };

    const filter = await this.buildAwardsFilter(query);
    const { skip, limit } = getPaginationMeta(query);

    // Mongo puts nulls first in ascending order, so records without the sort
    // value are paged separately after the ones with it, in both directions
    const withValue = { $and: [filter, hasSortValue] };
    const withoutValue = { $and: [filter, { $nor: [hasSortValue] }] };

    const [total, withValueCount] = await Promise.all([
      AwardTenderModel.countDocuments(filter),
      AwardTenderModel.countDocuments(withValue),
    ]);

    const findPage = (
      pageFilter: QueryFilter<AwardTenderDocument>,
      pageSkip: number,
      pageLimit: number,
      sort: Record<string, 1 | -1>,
    ) =>
      pageLimit > 0
        ? AwardTenderModel.find(pageFilter)
            .select(AWARD_LIST_SELECT)
            .sort(sort)
            .skip(pageSkip)
            .limit(pageLimit)
            .populate(AWARD_LIST_POPULATE)
            .lean()
            .exec()
        : Promise.resolve([]);

    const withValueLimit = Math.max(0, Math.min(limit, withValueCount - skip));
    const [withValueItems, withoutValueItems] = await Promise.all([
      findPage(withValue, skip, withValueLimit, {
        [sortField]: direction,
        _id: direction,
      }),
      findPage(
        withoutValue,
        Math.max(0, skip - withValueCount),
        limit - withValueLimit,
        { _id: direction },
      ),
    ]);

    return {
      total,
      results: [...withValueItems, ...withoutValueItems].map((tender) =>
        this.serializeAwardListItem(tender as unknown as AwardListLeanItem),
      ),
    };
  }

  async getAwardsStats(query: AwardTenderFiltersRequestDto) {
    const filter = await this.buildAwardsFilter(query);

    const countDistinct = async (expression: string | object) => {
      const [result] = await AwardTenderModel.aggregate<{ count: number }>([
        { $match: filter },
        { $project: { value: expression } },
        { $unwind: '$value' },
        { $group: { _id: '$value' } },
        { $count: 'count' },
      ]).allowDiskUse(true);

      return result?.count ?? 0;
    };

    const [totals, winnersCount, buyersCount, countriesCount] =
      await Promise.all([
        AwardTenderModel.aggregate<{
          awardsCount: number;
          totalAwardValueEur: number;
        }>([
          { $match: filter },
          {
            $group: {
              _id: null,
              awardsCount: { $sum: 1 },
              totalAwardValueEur: { $sum: '$awardValueEur' },
            },
          },
        ]).allowDiskUse(true),
        countDistinct('$winners'),
        countDistinct({ $setUnion: ['$leadBuyers', '$nonLeadBuyers'] }),
        countDistinct('$placeOfPerformanceCountries'),
      ]);

    return {
      awardsCount: totals[0]?.awardsCount ?? 0,
      totalAwardValueEur: totals[0]?.totalAwardValueEur ?? 0,
      winnersCount,
      buyersCount,
      countriesCount,
    };
  }

  private async buildAwardsFilter(
    query: AwardTenderFiltersRequestDto,
  ): Promise<QueryFilter<AwardTenderDocument>> {
    const baseFilter = await this.tedSearchFilters.buildLocalTenderQuery({
      text: query.q,
      cpvCodes: query.cpvCodes,
      placeOfPerformance: query.countries,
      contractNature: query.contractNature,
      procedureType: query.procedureType,
    });

    const parts: QueryFilter<AwardTenderDocument>[] = [];

    if (Object.keys(baseFilter).length) {
      parts.push(baseFilter);
    }

    if (query.awardDateFrom || query.awardDateTo) {
      const range: Record<string, Date> = {};

      if (query.awardDateFrom) {
        range.$gte = new Date(query.awardDateFrom);
      }

      if (query.awardDateTo) {
        const to = new Date(query.awardDateTo);

        // A plain date means "up to the end of that day"
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.awardDateTo)) {
          to.setUTCHours(23, 59, 59, 999);
        }

        range.$lte = to;
      }

      // Same field the list returns as awardDate
      parts.push({ awardDate: range });
    }

    if (query.valueMin !== undefined || query.valueMax !== undefined) {
      parts.push({
        awardValueEur: {
          ...(query.valueMin !== undefined && { $gte: query.valueMin }),
          ...(query.valueMax !== undefined && { $lte: query.valueMax }),
        },
      });
    }

    if (query.winnerId) {
      parts.push({ winners: new Types.ObjectId(query.winnerId) });
    }

    if (query.buyerId) {
      const buyerId = new Types.ObjectId(query.buyerId);

      parts.push({
        $or: [{ leadBuyers: buyerId }, { nonLeadBuyers: buyerId }],
      });
    }

    return parts.length ? { $and: parts } : {};
  }

  private serializeAwardListItem(tender: AwardListLeanItem) {
    const toRef = (doc?: AwardListRef) =>
      doc?._id ? { id: String(doc._id), name: doc.name ?? null } : null;

    return {
      id: tender.id,
      title: tender.title ?? tender.titleProc ?? null,
      awardDate: tender.awardDate ?? null,
      awardValueEur: tender.awardValueEur ?? null,
      country: tender.placeOfPerformanceCountries?.[0] ?? null,
      buyer: toRef(tender.leadBuyers?.[0] ?? tender.nonLeadBuyers?.[0]),
      winners: (tender.winners ?? []).map(toRef).filter(Boolean),
    };
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
      awardTenders: awardTenders.map(AwardTenderModel.serializeList),
    };
  }

  async getAwardTenderById(id: string) {
    const awardTender = await AwardTenderModel.findOne({ id })
      .populate(awardTenderPopulateFields)
      .exec();

    if (!awardTender) {
      throw new NotFoundException('Award tender not found');
    }

    return AwardTenderModel.serializeDetail(awardTender);
  }

  private async getLotsWithEurValues(
    lots: NormalizedAwardTenderLot[],
    publicationDate?: Date,
  ): Promise<AwardTenderLot[]> {
    const lotsEur: (number | null)[][] = await Promise.all(
      lots.map((lot) => {
        const { awardValue, estimatedValue } = lot;

        return Promise.all([
          this.tendersService._calculateEstimatedValueEur(
            awardValue?.amount,
            awardValue?.currency,
            publicationDate,
          ),
          this.tendersService._calculateEstimatedValueEur(
            estimatedValue?.amount,
            estimatedValue?.currency,
            publicationDate,
          ),
        ]);
      }),
    );

    return lots.map((lot, i) => {
      return {
        ...lot,
        awardValueEur: lotsEur[i][0],
        estimatedValueEur: lotsEur[i][1],
      };
    });
  }

  private getAwardValueFallbackFromLots(lots: AwardTenderLot[]): {
    amount: number | null;
    currency: string | null;
  } {
    const lotAwardValues = lots.flatMap((lot) => {
      const amount = lot.awardValue?.amount;

      return typeof amount === 'number' && Number.isFinite(amount)
        ? [{ amount, currency: lot.awardValue?.currency ?? null }]
        : [];
    });

    if (!lotAwardValues.length) {
      return {
        amount: null,
        currency: null,
      };
    }

    const currencies = Array.from(
      new Set(lotAwardValues.map((value) => value.currency).filter(Boolean)),
    );

    if (currencies.length !== 1) {
      return {
        amount: null,
        currency: null,
      };
    }

    return {
      amount: lotAwardValues.reduce((acc, value) => acc + value.amount, 0),
      currency: currencies[0],
    };
  }

  private getAwardValueEurFallbackFromLots(
    lots: AwardTenderLot[],
  ): number | null {
    const amount = lots
      .flatMap((lot) => {
        return typeof lot.awardValueEur === 'number' &&
          Number.isFinite(lot.awardValueEur)
          ? [lot.awardValueEur]
          : [];
      })
      .reduce((acc, value) => acc + value, 0);

    return amount > 0 ? amount : null;
  }

  async upsertAwardTender(
    notice: TedNotice,
  ): Promise<AwardTenderDocument | null> {
    const normalizedTender =
      await this.normalizer.normalizeAwardTenderNotice(notice);
    if (!normalizedTender.id) {
      return null;
    }

    const [
      { lots: awardLots, winners: winnersNormalized, lotWinners },
      savedPureBuyers,
      { winners: oldWinnersIds, buyers: oldBuyersIds },
    ] = await Promise.all([
      this.normalizer.normalizeAwardTenderLotsAndWinners(notice),
      this.buyerService.upsertPureBuyersFromTEDNotice(notice),
      AwardTenderModel.findOne({ id: normalizedTender.id }).then((t) => {
        return {
          winners: t?.winners?.map((w) => w.toString()) ?? [],
          buyers: [
            ...(t?.leadBuyers?.map((b) => b.toString()) ?? []),
            ...(t?.nonLeadBuyers?.map((b) => b.toString()) ?? []),
          ],
        };
      }),
    ]);

    const winnersDocs: ContractorDocument[] = (await Promise.all(
      winnersNormalized.map((winner) =>
        this.contractorService.upsertAwardWinner(winner),
      ),
    ).then((ws) => ws.filter(Boolean))) as ContractorDocument[];

    normalizedTender.lots = awardLots.map((l) => {
      const winner = winnersDocs.find((w) => {
        return lotWinners.find((lw) => {
          return (
            lw.lotIdentifier === l.identifier &&
            this.normalizer.getWinnerKey(w) === lw.winnerKey
          );
        });
      });

      return {
        ...l,
        winner: winner?._id,
      };
    });

    const [lotsWithEur, tenderEstimatedValueEur, tenderAwardValueEur] =
      await Promise.all([
        this.getLotsWithEurValues(
          normalizedTender.lots,
          normalizedTender.publicationDate,
        ),
        this.tendersService._calculateEstimatedValueEur(
          normalizedTender.estimatedValue.amount,
          normalizedTender.estimatedValue.currency,
          normalizedTender.publicationDate,
        ),
        this.tendersService._calculateEstimatedValueEur(
          normalizedTender.awardValue.amount,
          normalizedTender.awardValue.currency,
          normalizedTender.publicationDate,
        ),
      ]);

    // Lots first: the tender fallback and the lots-sum rule rely on them
    const { lots: sanitizedLots, corrections: lotCorrections } =
      sanitizeLotAwardValues(lotsWithEur);

    const lotAwardValue = this.getAwardValueFallbackFromLots(sanitizedLots);
    const { tender: sanitizedTender, corrections: tenderCorrections } =
      sanitizeTenderAwardValue(
        {
          awardValue: {
            amount: normalizedTender.awardValue.amount ?? lotAwardValue.amount,
            currency:
              normalizedTender.awardValue.currency ?? lotAwardValue.currency,
          },
          awardValueEur:
            tenderAwardValueEur ??
            this.getAwardValueEurFallbackFromLots(sanitizedLots),
          estimatedValueEur: tenderEstimatedValueEur,
        },
        sanitizedLots,
      );

    const insertPayload = {
      ...normalizedTender,
      placeOfPerformanceCountries: await this.getAwardCountries(
        normalizedTender.placeOfPerformanceCountries,
        savedPureBuyers.leadIds,
      ),
      awardValue: sanitizedTender.awardValue,
      estimatedValueEur: tenderEstimatedValueEur,
      awardValueEur: sanitizedTender.awardValueEur,
      awardValueCorrections: [...lotCorrections, ...tenderCorrections],
      awardDate: getAwardDate(
        normalizedTender.awardDecisionDates,
        normalizedTender.publicationDate,
      ),
      lots: sanitizedLots,
      leadBuyers: savedPureBuyers.leadIds,
      nonLeadBuyers: savedPureBuyers.nonLeadIds,
      winners: getUniqArray(
        sanitizedLots.map((l) => l.winner?.toString()),
      ).filter(Boolean),
    };
    const payload = {
      $set: insertPayload,
      $unset: this.buildAwardTenderUnset(insertPayload),
    };

    const awardTender = await AwardTenderModel.findOneAndUpdate(
      {
        id: normalizedTender.id,
      },
      payload,
      {
        returnDocument: 'after',
        upsert: true,
      },
    );

    await Promise.all([
      this.contractorService.refreshContractorsAwardMeta([
        ...insertPayload.winners,
        ...oldWinnersIds,
      ]),
      this.buyerService.refreshBuyersTenderMeta([
        ...oldBuyersIds,
        ...savedPureBuyers.leadIds,
        ...savedPureBuyers.nonLeadIds,
      ]),
    ]);

    return awardTender;
  }

  // ~15% of award notices have no place of performance at all; the country in
  // the TED title comes from the buyer then, so fall back to lead buyers
  private async getAwardCountries(
    placeOfPerformanceCountries: string[],
    leadBuyerIds: string[],
  ): Promise<string[]> {
    if (placeOfPerformanceCountries.length || !leadBuyerIds.length) {
      return placeOfPerformanceCountries;
    }

    const buyers = await BuyerModel.find({
      _id: { $in: leadBuyerIds as any },
    })
      .select('address.country')
      .lean()
      .exec();

    return getUniqArray(buyers.map((buyer) => buyer.address?.country));
  }

  private buildAwardTenderUnset(
    normalizedTender: Partial<AwardTenderDocument>,
  ): Record<string, ''> {
    const unset: Record<string, ''> = {};

    for (const field of OPTIONAL_TENDER_UNSET_FIELDS) {
      if (normalizedTender[field] === undefined) {
        unset[field] = '';
      }
    }

    return unset;
  }

  async saveResultTedTenders(
    notices: TedNotice[],
    options: SaveAwardTedTendersOptions = {},
  ): Promise<SaveAwardTedTendersResult> {
    const noticesToSave = options.skipExistingByPublicationNumber
      ? await this.filterExistingAwardTenderNotices(notices)
      : notices;

    const changedTenders: AwardTenderDocument[] = [];

    for (const notice of noticesToSave) {
      const awardTender = await this.upsertAwardTender(notice);
      if (awardTender) {
        changedTenders.push(awardTender);
      }
    }

    return {
      saved: changedTenders.length,
      updated: changedTenders.length,
      skipped: notices.length - changedTenders.length,
      changedTenders,
    };
  }

  private async filterExistingAwardTenderNotices(
    notices: TedNotice[],
  ): Promise<TedNotice[]> {
    const publicationNumbers = notices
      .map((notice) => getStringValue('publication-number', notice))
      .filter(Boolean);

    if (!publicationNumbers.length) {
      return [];
    }

    const existingAwardTenders = await AwardTenderModel.find({
      id: { $in: publicationNumbers },
    })
      .select('id')
      .lean()
      .exec();
    const existingIds = new Set(
      existingAwardTenders.flatMap((tender) => (tender.id ? [tender.id] : [])),
    );

    return notices.filter((notice) => {
      const publicationNumber = getStringValue('publication-number', notice);

      return !!publicationNumber && !existingIds.has(publicationNumber);
    });
  }
}
