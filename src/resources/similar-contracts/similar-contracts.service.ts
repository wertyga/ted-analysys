import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SimilarContractAwardsRequestDto } from './dto/similar-contract-awards-request.dto';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import {
  TedNotice,
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
  TedSortOrder,
  TedTenderSortColumn,
} from '@/resources/ted-search/types/ted-search.types';
import {
  getTedDate,
  searchTendersDefaultFields,
} from '@/resources/ted-search/utils';
import { TENDER_RESULT_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { winnerFields } from './similar-contracts.utils';
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
} from './similar-contracts.xml';
import { TendersService } from '@/resources/tenders/tenders.service';
import {
  AwardTenderModel,
  AwardTenderWinner,
  AwardTenderDocument,
} from './schemas';
import {
  getPaginationMeta,
  readDate,
  readString,
  tenderCpvPopulateFields,
} from '@/utils';
import { buildTedTenderSearchQuery } from '@/resources/ted-search/ted-builders';
import {
  AWARD_HISTORY_FIELDS,
  SIMILAR_CONTRACTS_CONFIG,
} from '@/config/similar-contracts.config';
import { QueryFilter } from 'mongoose';

export type normalizedAwardTenderDto = NormalizedTenderDto & {
  winnerName?: string | string[];
  winnerIdentifier?: string | string[];
  winnerCountry?: string | string[];
  winnerCountrySub?: string | string[];
  winnerCity?: string | string[];
  winnerPostCode?: string | string[];
  winnerSize?: string | string[];
  winnerListed?: string | string[];
  winnerSelectionStatus?: string | string[];
  winnerDecisionDate?: string | string[];
};

@Injectable()
export class SimilarContractsService {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private tenderNormalizer: TenderNormalizerService,
    private readonly tendersService: TendersService,
  ) {}

  async normalizeResultTender(
    notice: TedNotice,
  ): Promise<normalizedAwardTenderDto> {
    const normalizedTenderDto =
      await this.tenderNormalizer.normalizeTedNoticeWithCpvCodes(notice, false);

    const awardXml = await fetchXmlContentFromNotice(notice.links);

    const xmlAwardValue = extractXmlAwardValue(awardXml);

    const xmlWinners = extractXmlAwardWinners(awardXml);

    const normalizedAward = {
      ...normalizedTenderDto,
      estimatedValue: xmlAwardValue ?? normalizedTenderDto.estimatedValue,
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
      winnerSelectionStatus:
        this.pickXmlWinnerField(xmlWinners, 'selectionStatus') ??
        notice['winner-selection-status'],
      winnerDecisionDate:
        this.pickXmlWinnerField(xmlWinners, 'decisionDate') ??
        notice['winner-decision-date'],
    };

    return normalizedAward;
  }

  async searchHistoryAwards(
    dto: SimilarContractAwardsRequestDto,
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
      limit: SIMILAR_CONTRACTS_CONFIG.awardTenderSearchLimit,
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

  async upsertAwardTender(normalizedTender: normalizedAwardTenderDto) {
    const estimatedValueEur =
      await this.tendersService.calculateEstimatedValueEur(normalizedTender);

    const awardTender = this.toAwardTenderDocument(
      normalizedTender,
      estimatedValueEur,
    );

    const filter = { id: normalizedTender.id, searchHash: { $exists: false } };

    const savedTender = await AwardTenderModel.findOneAndUpdate(
      filter,
      { $set: awardTender },
      { returnDocument: 'after', upsert: true, strict: false },
    )
      .populate(tenderCpvPopulateFields)
      .lean()
      .exec();

    return savedTender;
  }

  async searchAwardsFromTed(filters: SimilarContractAwardsRequestDto) {
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
    date.setFullYear(
      date.getFullYear() - SIMILAR_CONTRACTS_CONFIG.historyYearsBack,
    );

    return getTedDate(date);
  }

  private buildAwardSearchHash(dto: SimilarContractAwardsRequestDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          historyYearsBack: SIMILAR_CONTRACTS_CONFIG.historyYearsBack,
          cpvCodes: this.normalizeHashArray(dto.cpvCodes),
          buyerCountries: this.normalizeHashArray(dto.buyerCountries),
          contractNature: this.normalizeHashArray(dto.contractNature),
          additionalFields: winnerFields,
          noticeTypes: TENDER_RESULT_NOTICE_TYPES,
        }),
      )
      .digest('hex');
  }

  private normalizeHashArray<T>(value?: T[]): T[] {
    return [...(value ?? [])].sort();
  }

  private pickXmlWinnerField(
    winners: XmlAwardWinner[],
    field: keyof AwardTenderWinner,
  ): string[] | undefined {
    const values = winners
      .map((winner) => winner[field])
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );

    return values.length > 0 ? values : undefined;
  }

  private toAwardTenderDocument(
    normalizedTender: normalizedAwardTenderDto,
    estimatedValueEur: number | null,
  ): Record<string, unknown> {
    const {
      winnerName,
      winnerIdentifier,
      winnerCountry,
      winnerCountrySub,
      winnerCity,
      winnerPostCode,
      winnerSize,
      winnerListed,
      winnerSelectionStatus,
      winnerDecisionDate,
      ...tender
    } = normalizedTender;

    const awardTender: Record<string, unknown> = {
      ...tender,
      estimatedValueEur,
      winners: this.buildAwardTenderWinners({
        winnerName,
        winnerIdentifier,
        winnerCountry,
        winnerCountrySub,
        winnerCity,
        winnerPostCode,
        winnerSize,
        winnerListed,
        winnerSelectionStatus,
        winnerDecisionDate,
      }),
    };

    return awardTender;
  }

  private buildAwardTenderWinners({
    winnerName,
    winnerIdentifier,
    winnerCountry,
    winnerCountrySub,
    winnerCity,
    winnerPostCode,
    winnerSize,
    winnerListed,
    winnerSelectionStatus,
    winnerDecisionDate,
  }: Pick<
    normalizedAwardTenderDto,
    | 'winnerName'
    | 'winnerIdentifier'
    | 'winnerCountry'
    | 'winnerCountrySub'
    | 'winnerCity'
    | 'winnerPostCode'
    | 'winnerSize'
    | 'winnerListed'
    | 'winnerSelectionStatus'
    | 'winnerDecisionDate'
  >): AwardTenderWinner[] {
    const names = this.readWinnerStringArray(winnerName);
    const identifiers = this.readWinnerStringArray(winnerIdentifier);
    const countries = this.readWinnerStringArray(winnerCountry);
    const countrySubs = this.readWinnerStringArray(winnerCountrySub);
    const cities = this.readWinnerStringArray(winnerCity);
    const postCodes = this.readWinnerStringArray(winnerPostCode);
    const sizes = this.readWinnerStringArray(winnerSize);
    const listed = this.readWinnerStringArray(winnerListed);
    const selectionStatuses = this.readWinnerStringArray(winnerSelectionStatus);
    const decisionDates = this.readWinnerStringArray(winnerDecisionDate);
    const winnersCount = Math.max(
      names.length,
      identifiers.length,
      countries.length,
      countrySubs.length,
      cities.length,
      postCodes.length,
      sizes.length,
      listed.length,
      selectionStatuses.length,
      decisionDates.length,
    );

    return Array.from({ length: winnersCount })
      .map((_, index): AwardTenderWinner => {
        const decisionDate = readDate(decisionDates[index]) ?? undefined;

        return {
          name: names[index],
          identifier: identifiers[index],
          country: countries[index],
          countrySub: countrySubs[index],
          city: cities[index],
          postCode: postCodes[index],
          size: sizes[index],
          listed: listed[index],
          selectionStatus: selectionStatuses[index],
          decisionDate,
        };
      })
      .filter((winner) =>
        [
          winner.name,
          winner.identifier,
          winner.country,
          winner.countrySub,
          winner.city,
          winner.postCode,
          winner.size,
        ].some((value) => value !== undefined),
      );
  }

  private readWinnerStringArray(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];

    return values
      .map((item) => readString(item))
      .filter((item): item is string => Boolean(item));
  }
}
