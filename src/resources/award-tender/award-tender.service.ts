import { Injectable, NotFoundException } from '@nestjs/common';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import { TenderNormalizerService } from '@/resources/tender-normalizer/tender-normalizer.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import {
  AwardTenderModel,
  AwardTenderDocument,
  AwardTenderLot,
  AwardTender,
} from './schemas';
import {
  ContractorService,
  WinnerNormalized,
} from '@/resources/contractor/contractor.service';
import {
  getArrayValue,
  getBooleanArrayValue,
  getDateArrayValue,
  getDateValue,
  getEngValueOrFirst,
  getLatestDate,
  getNumberArrayValue,
  getNumberValue,
  getPaginationMeta,
  getStringArrayValue,
  getStringValue,
  getUniqArray,
  parseNoticeDateTime,
} from '@/utils';
import { QueryFilter } from 'mongoose';
import { NormalizedTenderLot } from '@/resources/tender-normalizer/tender-normalizer.service';

export type NormalizedAwardTenderLot = Omit<
  AwardTenderLot,
  'estimatedValueEur' | 'awardValueEur'
>;

type NormalizedAwardTender = Omit<
  AwardTender,
  '_id' | 'estimatedValueEur' | 'awardValueEur' | 'winners' | 'lots'
> & {
  lots: NormalizedAwardTenderLot[];
};

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
  constructor(
    private tenderNormalizer: TenderNormalizerService,
    private readonly tendersService: TendersService,
    private readonly contractorService: ContractorService,
  ) {}

  normalizeWinnersNotice(notice: TedNotice): WinnerNormalized[] {
    const data: Record<keyof WinnerNormalized, string[] | boolean[]> = {
      name: getStringArrayValue('winner-name', notice),
      identifier: getStringArrayValue('winner-identifier', notice),
      countries: getStringArrayValue('winner-country', notice),
      countrySubs: getStringArrayValue('winner-country-sub', notice),
      cities: getStringArrayValue('winner-city', notice),
      postCodes: getStringArrayValue('winner-post-code', notice),
      size: getStringArrayValue('winner-size', notice),
      listed: getBooleanArrayValue('winner-listed', notice),
      internetAddresses: getStringArrayValue('winner-internet-address', notice),
      email: getStringArrayValue('winner-email', notice),
      ownerNationalities: getStringArrayValue(
        'winner-owner-nationality',
        notice,
      ),
      euRegistrationNumber: getStringArrayValue(
        'eu-registration-number',
        notice,
      ),
    };

    const maxLength = Math.max(
      ...Object.values(data).flatMap((r) => r.length),
      0,
    );

    if (!maxLength) {
      return [];
    }

    const winners = new Array(maxLength).fill(undefined);

    Object.entries(data).forEach(([key, values]) => {
      for (let i = 0; i < maxLength; i++) {
        winners[i] = {
          ...(winners[i] ?? {}),
          [key]: values[i],
        };
      }
    });

    return winners;
  }

  normalizeAwardLotsNotice(notice: TedNotice): NormalizedAwardTenderLot[] {
    const data = {
      resultValues: getNumberArrayValue('result-value-lot', notice),
      resultValuesCurs: getArrayValue('result-value-cur-lot', notice),
      resultLotIdentifiers: getArrayValue('result-lot-identifier', notice),
    };

    const tenderLots = this.tenderNormalizer.normalizeTenderLotsNotice(notice);

    return tenderLots.map((l, i) => {
      return {
        ...l,
        resultLotIdentifier: data.resultLotIdentifiers?.[i],
        awardValue: {
          amount: data.resultValues?.[i] ?? null,
          currency: data.resultValuesCurs?.[i] ?? data.resultValuesCurs?.[0],
        },
      };
    });
  }

  normalizeAwardTenderNotice(notice: TedNotice): NormalizedAwardTender {
    const awardLots = this.normalizeAwardLotsNotice(notice);

    const frameworkData =
      this.tenderNormalizer.normalizeFrameworkFromTEDNotice(notice);

    const data = {
      id: getStringValue('publication-number', notice),
      noticeType: getStringValue('notice-type', notice),
      noticeSubtype: getStringValue('notice-subtype', notice),
      noticeVersion: getStringValue('notice-version', notice),
      procedureType: getStringValue('procedure-type', notice),
      title: getEngValueOrFirst('notice-title', notice),
      titleProc: getEngValueOrFirst('title-proc', notice),
      description: getEngValueOrFirst('description-proc', notice),

      selectionStatuses: getStringArrayValue('winner-selection-status', notice),

      publicationDate: getDateValue('publication-date', notice),
      dispatchDate: getDateValue('dispatch-date', notice),
      submissionDeadline: getDateValue('deadline', notice),
      contractNature: getStringValue(
        'contract-nature-main-proc',
        notice,
      ) as TedContractNature,
      mainClassificationProc: getStringArrayValue(
        'main-classification-proc',
        notice,
      ),
      cpvCodes: getStringArrayValue('classification-cpv', notice),
      placeOfPerformanceCountriesProc: getStringArrayValue(
        'place-of-performance-country-proc',
        notice,
      ),
      placeOfPerformanceCitiesProc: getStringArrayValue(
        'place-of-performance-city-proc',
        notice,
      ),

      links: notice.links,

      selectionCriteriaSources: getStringArrayValue(
        'selection-criteria-source',
        notice,
      ),

      estimatedValue: getNumberValue('estimated-value-proc', notice),
      estimatedValueCur: getStringValue('estimated-value-cur-proc', notice),

      resulValue: getNumberValue('result-value-notice', notice),
      resulValueCur: getStringValue('result-value-cur-notice', notice),
    };

    const lotsCodes: string[] = awardLots.flatMap(
      ({ mainClassification, additionalClassifications }) => {
        return [
          ...(mainClassification ?? []),
          ...(additionalClassifications ?? []),
        ];
      },
    );
    const maxEndDate = getLatestDate(awardLots.map((l) => l.plannedEndDate));

    return {
      ...data,
      ...this.tenderNormalizer.normalizeBuyerFieldsFromTEDNotice(notice),

      awardDecisionDates: getDateArrayValue('winner-decision-date', notice).map(
        (d) => (d ? d.toISOString() : ''),
      ),
      awardValue: this.tenderNormalizer.getMoneyValueFromNotice(
        ['result-value-notice', 'total-value'],
        ['result-value-cur-notice', 'total-value-cur'],
        notice,
      ),
      estimatedValue: this.tenderNormalizer.getMoneyValueFromNotice(
        ['estimated-value-proc', 'total-value'],
        ['estimated-value-cur-proc', 'total-value-cur'],
        notice,
      ),
      cpvCodes: Array.from(
        new Set([
          ...lotsCodes,
          ...data.cpvCodes,
          ...data.mainClassificationProc,
        ]),
      ),

      isFrameworkAgreement: frameworkData.isFrameworkAgreements,
      lots: awardLots,

      placeOfPerformanceCities: getUniqArray(
        data.placeOfPerformanceCitiesProc,
        awardLots.map((l) => l.placeOfPerformanceCity),
      ),
      placeOfPerformanceCountries: getUniqArray(
        data.placeOfPerformanceCountriesProc,
        awardLots.map((l) => l.placeOfPerformanceCountry),
      ),
      placeOfPerformanceSubdivisions: getUniqArray(
        awardLots.map((l) => l.placeOfPerformanceSubdivision),
      ),

      plannedEndDate: maxEndDate,
    };
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
      buyerCountry: tender.buyerCountry,
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
    const normalizedTender = this.normalizeAwardTenderNotice(notice);
    const winners = this.normalizeWinnersNotice(notice);

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
