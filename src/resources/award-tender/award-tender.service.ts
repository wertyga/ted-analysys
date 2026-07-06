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
import { BuyerService } from '@/resources/buyer/buyer.service';
import fs from 'node:fs';
import { ContractorDocument } from '@/resources/contractor/schemas';

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
  ): Promise<AwardTenderDocument | null> {
    const normalizedTender = this.normalizer.normalizeAwardTenderNotice(notice);
    if (!normalizedTender.id) {
      return null;
    }

    const [
      { lots: awardLots, winners: winnersNormalized, lotWinners },
      savedPureBuyers,
    ] = await Promise.all([
      this.normalizer.normalizeAwardTenderLotsAndWinners(notice),
      this.buyerService.upsertPureBuyersFromTEDNotice(notice),
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

    const lotAwardValue = this.getAwardValueFallbackFromLots(lotsWithEur);
    const awardValueWithFallback = {
      amount: normalizedTender.awardValue.amount ?? lotAwardValue.amount,
      currency: normalizedTender.awardValue.currency ?? lotAwardValue.currency,
    };
    const awardValueEurWithFallback =
      tenderAwardValueEur ?? this.getAwardValueEurFallbackFromLots(lotsWithEur);

    const insertPayload = {
      ...normalizedTender,
      awardValue: awardValueWithFallback,
      estimatedValueEur: tenderEstimatedValueEur,
      awardValueEur: awardValueEurWithFallback,
      lots: lotsWithEur,
      leadBuyers: savedPureBuyers.leadIds,
      nonLeadBuyers: savedPureBuyers.nonLeadIds,
      winners: getUniqArray(
        lotsWithEur.map((l) => l.winner?.toString()),
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
