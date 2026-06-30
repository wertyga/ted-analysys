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
    const winnersNormalized = this.normalizer.normalizeWinnersNotice(notice);

    const { publicationDate, lots, estimatedValue, awardValue, id } =
      normalizedTender;

    if (!id) {
      return null;
    }

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

    const insertPayload = {
      ...normalizedTender,
      estimatedValueEur: tenderEstimatedValueEur,
      awardValueEur: tenderAwardValueEur,
      lots: lotsWithEur,
    };

    const payload = updateExisting
      ? {
          $set: insertPayload,
          $unset: this.buildAwardTenderUnset(),
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

    const wasTenderCreated = result?.lastErrorObject?.updatedExisting === false;
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

    if (!wasTenderCreated && !updateExisting) {
      await awardTender.save();

      await this.buyerService.refreshBuyersTenderMeta(buyersIds);

      return awardTender;
    }

    const winnersDocs = await this.contractorService.upsertListAwardWinners(
      winnersNormalized,
      {
        awardTenderId: awardTender._id.toString(),
        cpvCodes: normalizedTender.cpvCodes,
      },
    );

    awardTender.winners = winnersDocs.map((winner) => winner._id);
    await awardTender.save();

    await this.buyerService.refreshBuyersTenderMeta(buyersIds);

    return awardTender;
  }

  private buildAwardTenderUnset(): Record<string, ''> {
    const unset: Record<string, ''> = {};

    for (const field of OPTIONAL_TENDER_UNSET_FIELDS) {
      unset[field] = '';
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
