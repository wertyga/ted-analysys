import { Injectable, NotFoundException } from '@nestjs/common';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';

import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import { TendersService } from '@/resources/tenders/tenders.service';
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
  getBooleanArrayValue,
  getPaginationMeta,
  getStringArrayValue,
} from '@/utils';
import { QueryFilter } from 'mongoose';
import {
  AwardTenderNormalizer,
  NormalizedAwardTenderLot,
} from './award-tender.normalizer';
import { BuyerService } from '@/resources/buyer/buyer.service';

export interface SaveAwardTedTendersResult {
  saved: number;
  updated: number;
  skipped: number;
  changedTenders: AwardTenderDocument[];
}

export interface SaveAwardTedTendersOptions {
  updateExisting?: boolean;
}

@Injectable()
export class AwardTenderService {
  normalizer = new AwardTenderNormalizer();

  constructor(
    private readonly tendersService: TendersService,
    private readonly contractorService: ContractorService,
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
      buyer: tender.buyer._id || tender.buyer,
      contractNature: tender.contractNature,
    };

    const { skip, limit } = getPaginationMeta(pagination);
    const [savedTenders, totalCount] = await Promise.all([
      AwardTenderModel.find(query)
        .sort({ publicationDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('winners')
        .lean(),
      AwardTenderModel.countDocuments(query),
    ]);

    return {
      totalNoticeCount: totalCount,
      notices: savedTenders,
    };
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

  async upsertAwardTender(
    notice: TedNotice,
    updateExisting?: boolean,
  ): Promise<AwardTenderDocument | null> {
    const normalizedTender = this.normalizer.normalizeAwardTenderNotice(notice);
    const winners = this.normalizer.normalizeWinnersNotice(notice);

    const { publicationDate, lots, estimatedValue, awardValue, id } =
      normalizedTender;

    if (!id) {
      return null;
    }

    const [lotsWithEur, buyer, tenderEstimatedValueEur, tenderAwardValueEur] =
      await Promise.all([
        this.getLotsWithEurValues(lots, publicationDate),
        this.buyerService.upsertBuyerFromTEDNotice(notice),
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

    const insertPayload = {
      ...normalizedTender,
      estimatedValueEur: tenderEstimatedValueEur,
      awardValueEur: tenderAwardValueEur,
      lots: lotsWithEur,
      buyer: buyer._id,
      winners: [],
    };

    const payload = updateExisting
      ? {
          $set: insertPayload,
          $unset: {
            additionalClassificationLot: '',
            descriptionLot: '',
            internalLotIdentifiers: '',
            mainClassificationLot: '',
            titleLot: '',
          },
        }
      : {
          $setOnInsert: insertPayload,
        };

    const result = await AwardTenderModel.findOneAndUpdate(
      {
        id: normalizedTender.id,
      },
      payload,
      { returnDocument: 'after', upsert: true, includeResultMetadata: true },
    );

    const wasTenderCreated = result?.lastErrorObject?.updatedExisting === false;
    const awardTender = result?.value;

    if (!awardTender) {
      return null;
    }

    if (!wasTenderCreated && !updateExisting) {
      return awardTender;
    }

    const winnersDocs = await this.contractorService.upsertListAwardWinners(
      winners,
      {
        awardTenderId: awardTender._id.toString(),
        cpvCodes: normalizedTender.cpvCodes,
      },
    );

    awardTender.winners = winnersDocs.map((winner) => winner._id);
    await awardTender.save();

    return awardTender;
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
