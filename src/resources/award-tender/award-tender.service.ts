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
  getStringArrayValue,
} from '@/utils';
import { QueryFilter, Types } from 'mongoose';
import {
  AwardTenderNormalizer,
  NormalizedAwardTenderLot,
} from './award-tender.normalizer';
import { BuyerService } from '@/resources/buyer/buyer.service';
import fs from 'node:fs';

export interface SaveAwardTedTendersResult {
  saved: number;
  updated: number;
  skipped: number;
  changedTenders: AwardTenderDocument[];
}

export interface SaveAwardTedTendersOptions {
  updateExisting?: boolean;
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

  constructor(
    @Inject(forwardRef(() => TendersService))
    private readonly tendersService: TendersService,
    private readonly contractorService: ContractorService,
    @Inject(forwardRef(() => BuyerService))
    private readonly buyerService: BuyerService,
  ) {}

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
      // buyer: tender.buyer._id || tender.buyer, // TODO: ??
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
    updateExisting?: boolean,
  ): Promise<AwardTenderDocument | null> {
    const normalizedTender = this.normalizer.normalizeAwardTenderNotice(notice);
    const {
      lots: awardLots,
      winners: winnersNormalized,
      lotWinners,
    } = await this.normalizer.normalizeAwardTenderLotsAndWinners(notice);
    normalizedTender.lots = awardLots;

    const { publicationDate, lots, estimatedValue, awardValue, id } =
      normalizedTender;

    if (!id) {
      return null;
    }

    const oldWinnerIds = updateExisting
      ? await AwardTenderModel.findOne({ id })
          .select('winners')
          .lean()
          .then((tender) =>
            (tender?.winners ?? []).map((winner) => winner.toString()),
          )
      : [];

    const [lotsWithEur, tenderEstimatedValueEur, tenderAwardValueEur] =
      await Promise.all([
        this.getLotsWithEurValues(lots, publicationDate),
        this.tendersService._calculateEstimatedValueEur(
          estimatedValue.amount,
          estimatedValue.currency,
          publicationDate,
        ),
        this.tendersService._calculateEstimatedValueEur(
          awardValue.amount,
          awardValue.currency,
          publicationDate,
        ),
      ]);
    const lotAwardValue = this.getAwardValueFallbackFromLots(lotsWithEur);

    const awardValueWithFallback = {
      amount: awardValue.amount ?? lotAwardValue.amount,
      currency: awardValue.currency ?? lotAwardValue.currency,
    };
    const awardValueEurWithFallback =
      tenderAwardValueEur ?? this.getAwardValueEurFallbackFromLots(lotsWithEur);

    const insertPayload = {
      ...normalizedTender,
      awardValue: awardValueWithFallback,
      estimatedValueEur: tenderEstimatedValueEur,
      awardValueEur: awardValueEurWithFallback,
      lots: lotsWithEur,
    };

    const payload = updateExisting
      ? {
          $set: insertPayload,
          $unset: this.buildAwardTenderUnset(insertPayload),
        }
      : {
          $setOnInsert: insertPayload,
        };

    const result = await AwardTenderModel.findOneAndUpdate(
      {
        id: normalizedTender.id,
      },
      payload,
      {
        returnDocument: 'after',
        upsert: true,
        includeResultMetadata: true,
        strict: false,
      },
    );

    const awardTender = result?.value;

    if (!awardTender) {
      return null;
    }

    const savedPureBuyers =
      await this.buyerService.upsertPureBuyersFromTEDNotice(notice);

    const buyersIds = [
      ...savedPureBuyers.leadIds,
      ...savedPureBuyers.nonLeadIds,
    ];

    awardTender.leadBuyers = savedPureBuyers.leadIds;
    awardTender.nonLeadBuyers = savedPureBuyers.nonLeadIds;

    const lotWinnerKeys = new Set(
      lotWinners.map((lotWinner) => lotWinner.winnerKey),
    );
    const lotWinnersNormalized = winnersNormalized.filter((winner) => {
      const winnerKey = this.normalizer.getWinnerKey(winner);

      return winnerKey ? lotWinnerKeys.has(winnerKey) : false;
    });

    const winnerResults = await Promise.all(
      lotWinnersNormalized.map((winner) =>
        this.contractorService.upsertAwardWinner(winner, {
          awardTenderId: awardTender._id.toString(),
        }),
      ),
    );
    const winnerDocByKey = new Map(
      winnerResults.flatMap((winnerDoc, index) => {
        const winnerKey = this.normalizer.getWinnerKey(
          lotWinnersNormalized[index],
        );

        return winnerDoc && winnerKey ? [[winnerKey, winnerDoc]] : [];
      }),
    );
    const lotWinnerByLotIdentifier = new Map(
      lotWinners.map((lotWinner) => [lotWinner.lotIdentifier, lotWinner]),
    );

    awardTender.lots = lotsWithEur.map((lot) => {
      const lotWinner = lotWinnerByLotIdentifier.get(lot.identifier);
      const winner = lotWinner
        ? winnerDocByKey.get(lotWinner.winnerKey)?._id
        : undefined;

      return {
        ...lot,
        ...(winner ? { winner } : {}),
      };
    });

    awardTender.winners = Array.from(
      new Set(awardTender.lots.flatMap((lot) => lot.winner?.toString() ?? [])),
    ).map((winnerId) => new Types.ObjectId(winnerId));
    await awardTender.save();

    await this.contractorService.refreshContractorsAwardMeta([
      ...oldWinnerIds,
      ...awardTender.winners.map((winner) => winner.toString()),
    ]);

    await this.buyerService.refreshBuyersTenderMeta(buyersIds);

    return awardTender;
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
    const awardTenders = await Promise.all(
      notices.map((notice: TedNotice) => {
        return this.upsertAwardTender(notice, options.updateExisting);
      }),
    );

    const changedTenders: AwardTenderDocument[] = awardTenders.filter(
      Boolean,
    ) as AwardTenderDocument[];

    return {
      saved: changedTenders.length,
      updated: changedTenders.length,
      skipped: notices.length - changedTenders.length,
      changedTenders,
    };
  }
}
