import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AwardTenderAwardsRequestDto } from './dto/award-tender-awards-request.dto';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import {
  TedNotice,
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
  TedSortOrder,
  TedTenderSortColumn,
} from '@/resources/ted-search/types/ted-search.types';
import { getTedDate } from '@/resources/ted-search/utils';
import { TENDER_RESULT_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import { TedEligibleCountryCode } from '@/resources/codelist';
import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import {
  NormalizedTenderDto,
  TenderNormalizerService,
} from '@/resources/tenders/tender-normalizer.service';
import { fetchXmlContentFromNotice } from '@/resources/tenders/tender-normalizer-xml';
import {
  extractXmlAwardValue,
  extractXmlAwardWinners,
  XmlAwardWinner,
} from './award-tender.xml';
import { TendersService } from '@/resources/tenders/tenders.service';
import { AwardTenderModel, AwardTenderDocument } from './schemas';
import {
  ContractorNormalized,
  ContractorService,
} from '@/resources/contractor/contractor.service';
import {
  extractPublicationNumberFromNotice,
  getPaginationMeta,
  readDate,
  readStringArray,
} from '@/utils';
import { buildTedTenderSearchQuery } from '@/resources/ted-search/ted-builders';
import {
  AWARD_HISTORY_FIELDS,
  AWARD_TENDER_CONFIG,
} from '@/config/award-tender.config';
import { QueryFilter } from 'mongoose';

type NormalizedAwardTender = NormalizedTenderDto & {
  awardDecisionDate?: Date;
};

export interface SaveAwardTedTendersResult {
  saved: number;
  updated: number;
  skipped: number;
  changedTenders: AwardTenderDocument[];
}

@Injectable()
export class AwardTenderService {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private tenderNormalizer: TenderNormalizerService,
    private readonly tendersService: TendersService,
    private readonly contractorService: ContractorService,
  ) {}

  async normalizeResultTender(notice: TedNotice): Promise<{
    normalizedAward: NormalizedAwardTender;
    winners: ContractorNormalized;
  }> {
    const normalizedTenderDto =
      this.tenderNormalizer.normalizeTedNotice(notice);

    const awardXml = await fetchXmlContentFromNotice(notice.links);

    const xmlAwardValue = extractXmlAwardValue(awardXml);

    const xmlWinners = extractXmlAwardWinners(awardXml);
    const awardDecisionDate = this.pickAwardDecisionDate(notice);
    const selectionStatus = this.pickWinnerNoticeValues(
      notice,
      'winner-selection-status',
    );
    const decisionDate =
      this.pickXmlWinnerField(xmlWinners, 'decisionDate') ??
      this.pickWinnerNoticeValues(notice, 'winner-decision-date');

    const normalizedAward = {
      ...normalizedTenderDto,
      estimatedValue: xmlAwardValue ?? normalizedTenderDto.estimatedValue,
      awardDecisionDate,
      selectionStatus,
      decisionDate,
    };

    const winners = {
      winnerName: this.pickWinnerValues(
        xmlWinners,
        'name',
        notice,
        'winner-name',
      ),
      winnerIdentifier: this.pickWinnerValues(
        xmlWinners,
        'identifier',
        notice,
        'winner-identifier',
      ),
      winnerCountry: this.pickWinnerValues(
        xmlWinners,
        'country',
        notice,
        'winner-country',
      ),
      winnerCountrySub: this.pickWinnerValues(
        xmlWinners,
        'countrySub',
        notice,
        'winner-country-sub',
      ),
      winnerCity: this.pickWinnerValues(
        xmlWinners,
        'city',
        notice,
        'winner-city',
      ),
      winnerPostCode: this.pickWinnerValues(
        xmlWinners,
        'postCode',
        notice,
        'winner-post-code',
      ),
      winnerSize: this.pickWinnerValues(
        xmlWinners,
        'size',
        notice,
        'winner-size',
      ),
      winnerListed: this.pickWinnerValues(
        xmlWinners,
        'listed',
        notice,
        'winner-listed',
      ),
      winnerInternetAddress: this.pickNoticeStringValues(
        notice,
        'winner-internet-address',
      ),
      winnerEmail: this.pickNoticeStringValues(notice, 'winner-email'),
    };

    return { normalizedAward, winners };
  }

  async searchHistoryAwards(dto: AwardTenderAwardsRequestDto) {
    return this.searchAwardTendersLocal(dto.tenderId, {
      page: dto.page,
      limit: dto.limit,
    });
  }

  private async searchHistoryAwardsFromTed(dto: {
    cpvCodes: string[];
    buyerCountries?: TedEligibleCountryCode[];
    contractNature: TedContractNature[];
  }): Promise<TedSearchResponse> {
    return this.tedSearchService.searchNotices({
      query: buildTedTenderSearchQuery({
        cpvCodes: dto.cpvCodes,
        buyerCountries: dto.buyerCountries,
        contractNature: dto.contractNature,
        noticeTypes: TENDER_RESULT_NOTICE_TYPES,
        publicationDateFrom: this.publicationDateFromHistoryTedDate,
        publicationDateTo: getTedDate(),
        winnerSelectionStatus: 'selec-w',
        sortColumn: TedTenderSortColumn.PUBLICATION_DATE,
        sortOrder: TedSortOrder.DESC,
      }),
      scope: TedScope.ALL,
      checkQuerySyntax: false,
      onlyLatestVersions: true,
      paginationMode: TedPaginationMode.PAGE_NUMBER,
      limit: AWARD_TENDER_CONFIG.awardTenderSearchLimit,
      page: 1,
      fields: AWARD_HISTORY_FIELDS,
    });
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

  async upsertAwardTender(
    normalizedTender: NormalizedAwardTender,
    winners: ContractorNormalized,
  ): Promise<AwardTenderDocument | null> {
    const estimatedValueEur =
      await this.tendersService.calculateEstimatedValueEur(normalizedTender);

    const result = (await AwardTenderModel.findOneAndUpdate(
      {
        id: normalizedTender.id,
      },
      {
        $setOnInsert: {
          ...normalizedTender,
          estimatedValueEur,
          sourceHash:
            this.tendersService.buildTenderSourceHash(normalizedTender),
          winners: [],
        },
      },
      { returnDocument: 'after', upsert: true, includeResultMetadata: true },
    ).select('_id')) as any;

    const wasTenderCreated = result?.lastErrorObject?.updatedExisting === false;
    const awardTender = result?.value;

    if (!awardTender) {
      return null;
    }

    if (!wasTenderCreated) {
      return awardTender;
    }

    const winnersDocs = await this.contractorService.upsertListAwardWinners(
      winners,
      {
        awardTenderId: awardTender._id.toString(),
        cpvCodes: normalizedTender.cpvCodes ?? [],
      },
    );

    awardTender.winners = winnersDocs.map((winner) => winner._id);
    await awardTender.save();

    return awardTender;
  }

  async saveResultTedTenders(
    notices: TedNotice[],
  ): Promise<SaveAwardTedTendersResult> {
    const noticesByPublicationNumber = new Map<string, TedNotice>();

    for (const notice of notices) {
      const publicationNumber = extractPublicationNumberFromNotice(notice);

      if (publicationNumber) {
        noticesByPublicationNumber.set(publicationNumber, notice);
      }
    }

    if (noticesByPublicationNumber.size === 0) {
      return {
        saved: 0,
        updated: 0,
        skipped: notices.length,
        changedTenders: [],
      };
    }

    const publicationNumbers = Array.from(noticesByPublicationNumber.keys());
    const existingTenders = await AwardTenderModel.find({
      id: { $in: publicationNumbers },
    })
      .select('id')
      .exec();
    const existingTendersByPublicationNumber = new Map(
      existingTenders.map((tender) => [tender.id, tender] as const),
    );
    let saved = 0;
    const updated = 0;
    let skipped = notices.length - noticesByPublicationNumber.size;
    const changedTenders: AwardTenderDocument[] = [];

    for (const [publicationNumber, notice] of noticesByPublicationNumber) {
      const existingTender =
        existingTendersByPublicationNumber.get(publicationNumber);

      if (existingTender) {
        skipped += 1;
        continue;
      }

      const { normalizedAward, winners } =
        await this.normalizeResultTender(notice);
      const awardTender = await this.upsertAwardTender(
        normalizedAward,
        winners,
      );

      if (awardTender) {
        changedTenders.push(awardTender);
        saved += 1;
      } else {
        skipped += 1;
      }
    }

    return { saved, updated, skipped, changedTenders };
  }

  async searchAwardsFromTed(filters: {
    cpvCodes: string[];
    buyerCountries?: TedEligibleCountryCode[];
    contractNature: TedContractNature[];
  }) {
    const tedTenders = await this.searchHistoryAwardsFromTed(filters);

    const normalizedTenders = await Promise.all(
      tedTenders.notices.map((tender) => {
        return this.normalizeResultTender(tender);
      }),
    );

    return {
      totalNoticeCount: tedTenders.totalNoticeCount,
      normalizedTenders,
    };
  }

  private get publicationDateFromHistoryTedDate(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - AWARD_TENDER_CONFIG.historyYearsBack);

    return getTedDate(date);
  }

  private pickXmlWinnerField(
    winners: XmlAwardWinner[],
    field: keyof XmlAwardWinner,
  ): string[] | undefined {
    const values = winners
      .map((winner) => winner[field])
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );

    return values.length > 0 ? values : undefined;
  }

  private pickWinnerValues(
    winners: XmlAwardWinner[],
    xmlField: keyof XmlAwardWinner,
    notice: TedNotice,
    noticeField: string,
  ): string[] {
    return (
      this.pickXmlWinnerField(winners, xmlField) ??
      this.pickNoticeStringValues(notice, noticeField)
    );
  }

  private pickNoticeStringValues(notice: TedNotice, field: string): string[] {
    return readStringArray(
      Array.isArray(notice[field]) ? notice[field] : [notice[field]],
    );
  }

  private pickAwardDecisionDate(notice: TedNotice): Date | undefined {
    const values = this.pickWinnerNoticeValues(notice, 'winner-decision-date');

    return readDate(values?.[0]) ?? undefined;
  }

  private pickWinnerNoticeValues(
    notice: TedNotice,
    field: 'winner-selection-status' | 'winner-decision-date',
  ): string[] | undefined {
    const values = readStringArray(
      Array.isArray(notice[field]) ? notice[field] : [notice[field]],
    );

    return values.length > 0 ? values : undefined;
  }

  private buildAwardTenderSourceHash(
    normalizedTender: NormalizedTenderDto,
  ): string {
    return createHash('sha256')
      .update(JSON.stringify(normalizedTender))
      .digest('hex');
  }
}
