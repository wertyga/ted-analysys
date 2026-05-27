import { Injectable, NotFoundException } from '@nestjs/common';
import { SimilarContractAwardsRequestDto } from './dto/similar-contract-awards-request.dto';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import {
  TedNotice,
  TedScope,
  TedSearchResponse,
  TedSortOrder,
  TedTenderSortColumn,
} from '@/resources/ted-search/types/ted-search.types';
import { getTedDate } from '@/resources/ted-search/utils';
import { TENDER_RESULT_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { winnerFields } from './similar-contracts.utils';
import {
  TenderDocument,
  TenderModel,
  TenderRecord,
} from '@/resources/tenders/schemas';
import { TenderNormalizerService } from '@/resources/tenders/tender-normalizer.service';

@Injectable()
export class SimilarContractsService {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private tenderNormalizer: TenderNormalizerService,
  ) {}

  async normalizeResultTender(notice: TedNotice) {
    const normalizedTenderDto =
      await this.tenderNormalizer.normalizeTedNoticeWithCpvCodes(notice, false);

    return {
      ...normalizedTenderDto,
      winnerName: notice['winner-name'],
      winnerIdentifier: notice['winner-identifier'],
      winnerCountry: notice['winner-country'],
      winnerCountrySub: notice['winner-country-sub'],
      winnerCity: notice['winner-city'],
      winnerPostCode: notice['winner-post-code'],
      winnerSize: notice['winner-size'],
      winnerListed: notice['winner-listed'],
      winnerSelectionStatus: notice['winner-selection-status'],
      winnerDecisionDate: notice['winner-decision-date'],
    };
  }

  async searchHistoryAwards(
    dto: SimilarContractAwardsRequestDto,
  ): Promise<TedSearchResponse> {
    return this.tedSearchService.searchTenders({
      cpvCodes: dto.cpvCodes,
      buyerCountries: dto.buyerCountries,
      contractNature: dto.contractNature,
      noticeTypes: TENDER_RESULT_NOTICE_TYPES,
      publicationDateFrom: this.publicationDateFromHistoryTedDate,
      publicationDateTo: getTedDate(),
      scope: TedScope.ALL,
      limit: dto.limit ?? 20,
      page: dto.page ?? 1,
      sortColumn: TedTenderSortColumn.PUBLICATION_DATE,
      sortOrder: TedSortOrder.DESC,
      additionalFields: winnerFields,
    });
  }

  async searchAwardsFromTed(tenderId: string): Promise<TedSearchResponse> {
    const tender: TenderDocument | null = await TenderModel.findOne({
      id: tenderId,
    });
    if (!tender) {
      throw new NotFoundException('Tender not found');
    }

    const filters: SimilarContractAwardsRequestDto = {
      cpvCodes: tender.cpvCodes,
      buyerCountries: [tender.buyerCountry],
      contractNature: [tender.contractNature],
    } as SimilarContractAwardsRequestDto;

    const tedTenders = await this.searchHistoryAwards(filters);

    return {
      totalNoticeCount: tedTenders.totalNoticeCount,
      notices: await Promise.all(
        tedTenders.notices.map((tender) => {
          return this.normalizeResultTender(tender);
        }),
      ),
    };
  }

  private get publicationDateFromHistoryTedDate(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 3);

    return getTedDate(date);
  }
}
