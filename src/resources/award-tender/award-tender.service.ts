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
  getPaginationMeta,
  readDate,
  readStringArray,
  tenderCpvPopulateFields,
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
      await this.tenderNormalizer.normalizeTedNoticeWithCpvCodes(notice, false);

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
      winnerName:
        this.pickXmlWinnerField(xmlWinners, 'name') ?? notice['winner-name'],
      winnerIdentifier:
        this.pickXmlWinnerField(xmlWinners, 'identifier') ??
        notice['winner-identifier'],
      winnerCountry:
        this.pickXmlWinnerField(xmlWinners, 'country') ??
        notice['winner-country'],
      winnerCountrySub:
        this.pickXmlWinnerField(xmlWinners, 'countrySub') ??
        notice['winner-country-sub'],
      winnerCity:
        this.pickXmlWinnerField(xmlWinners, 'city') ?? notice['winner-city'],
      winnerPostCode:
        this.pickXmlWinnerField(xmlWinners, 'postCode') ??
        notice['winner-post-code'],
      winnerSize:
        this.pickXmlWinnerField(xmlWinners, 'size') ?? notice['winner-size'],
      winnerListed:
        this.pickXmlWinnerField(xmlWinners, 'listed') ??
        notice['winner-listed'],
      winnerInternetAddress: notice['winner-internet-address'],
      winnerEmail: notice['winner-email'],
    };

    return { normalizedAward, winners };
  }

  async searchHistoryAwards(
    dto: AwardTenderAwardsRequestDto,
  ): Promise<TedSearchResponse> {
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

  async searchAwardsLocally(
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
        .populate(tenderCpvPopulateFields)
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
  ) {
    const estimatedValueEur =
      await this.tendersService.calculateEstimatedValueEur(normalizedTender);

    const winnerIds = await this.contractorService
      .upsertAwardWinners(winners)
      .then((winners) => winners.map((winner) => winner._id));

    const awardTender = {
      ...normalizedTender,
      estimatedValueEur,
      sourceHash: this.tendersService.buildTenderSourceHash(normalizedTender),
      winners: winnerIds,
    };

    const savedTender = await AwardTenderModel.findOneAndUpdate(
      { id: normalizedTender.id },
      { $set: awardTender },
      { returnDocument: 'after', upsert: true, strict: false },
    )
      .populate(tenderCpvPopulateFields)
      .lean()
      .exec();

    return savedTender;
  }

  async searchAwardsFromTed(filters: AwardTenderAwardsRequestDto) {
    const tedTenders = await this.searchHistoryAwards(filters);

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
