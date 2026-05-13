import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TedSearchService } from '../ted-search/ted-search.service';
import { TenderGeneralAnalysisDetailDto } from '../tender-analysis/dto/tender-general-analysis.dto';
import {
  TedNotice,
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
} from '../ted-search/types/ted-search.types';
import { TenderGeneralAnalysisService } from '../tender-analysis/tender-general-analysis.service';
import {
  TenderGeneralAnalysis,
  TenderGeneralAnalysisModel,
} from '../tender-analysis/schemas';
import { TenderListDto } from './dto/tender.dto';
import {
  TenderDocument,
  TenderModel,
  TENDER_XML_CACHE_SELECT,
} from './schemas';
import { TenderNormalizerService } from './tender-normalizer.service';
import { TedPublicationNumbersSearchRequestDto } from '@/resources/ted-search/dto/ted-publication-numbers-search-request.dto';
import {
  areTedNoticeVersionsDifferent,
  extractPublicationNumberFromNotice,
  isRecord,
  isTedNotice,
  isTedPublicationNumber,
  valueToString,
} from '@/utils';
import { tenderCpvPopulateFields } from '@/resources/tenders/utils/tender.utils';
import { SortOrder } from 'mongoose';

export interface GatherActiveTendersResult {
  completed?: boolean;
  totalCount?: number;
  pagesFetched: number;
  noticesFetched: number;
  tendersSkipped: number;
  tendersSaved: number;
  resumeIterationNextToken?: string;
  errorMessage?: string;
}

export interface MigrateTenderDateFieldsResult {
  scanned: number;
  updated: number;
  skipped: number;
}

export interface SaveNewTedTendersResult {
  saved: number;
  updated: number;
  skipped: number;
  changedTenders: TenderDocument[];
}

export type TenderDocumentWithGeneralAnalysis = TenderDocument & {
  generalAnalysis?: TenderGeneralAnalysisDetailDto | null;
};

@Injectable()
export class TendersService {
  tenderDefaultFields = [
    'notice-identifier',
    'publication-number',
    'notice-type',
    'notice-subtype',
    'notice-version',
    'notice-title',
    'publication-date',
    'dispatch-date',
    'deadline',
    'deadline-receipt-tender-date-lot',
    'deadline-receipt-tender-time-lot',
    'deadline-receipt-answers-date-lot',
    'deadline-receipt-answers-time-lot',
    'title-proc',
    'title-lot',
    'description-proc',
    'description-lot',
    'procedure-type',
    'contract-nature',
    'legal-basis',
    'classification-cpv',
    'main-classification-proc',
    'main-classification-lot',
    'additional-classification-lot',
    'buyer-name',
    'buyer-identifier',
    'buyer-country',
    'buyer-city',
    'main-activity',
    'buyer-email',
    'buyer-internet-address',
    'buyer-profile',
    'estimated-value-proc',
    'estimated-value-cur-proc',
    'estimated-value-lot',
    'estimated-value-cur-lot',
    'place-of-performance-country-proc',
    'place-of-performance-country-lot',
    'place-of-performance-city-proc',
    'place-of-performance-city-lot',
    'identifier-lot',
    'internal-identifier-lot',
    'links',
    'document-url-lot',
    'submission-url-lot',
    'electronic-submission-lot',
    'submission-language',
    'official-language',
    'contract-duration-start-date-lot',
    'contract-duration-end-date-lot',
    'duration-period-value-lot',
    'duration-period-unit-lot',
    'sme-lot',
    'framework-agreement-lot',
    'dps-usage-lot',
    'eu-fund-lot',
    'selection-criterion-name-lot',
    'selection-criterion-description-lot',
    'award-criterion-name-lot',
    'award-criterion-description-lot',
    'award-criterion-type-lot',
    'award-criterion-number-weight-lot',
  ];

  constructor(
    @Inject(forwardRef(() => TedSearchService))
    private readonly tedSearchService: TedSearchService,
    private readonly tenderNormalizer: TenderNormalizerService,
    @Inject(forwardRef(() => TenderGeneralAnalysisService))
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  async upsertTender(notice: TedNotice): Promise<TenderDocument | undefined> {
    const publicationNumber = extractPublicationNumberFromNotice(notice);

    if (!publicationNumber) {
      return undefined;
    }

    const dto = await this.tenderNormalizer.normalizeTedNoticeWithCpvCodes(
      notice,
      true,
    );

    const tenderDoc = await TenderModel.findOneAndUpdate(
      { id: publicationNumber },
      {
        $set: {
          ...dto,
          id: publicationNumber,
          source: 'TED',
          publicationNumber,
        },
      },
      { returnDocument: 'after', upsert: true },
    )
      .select(TENDER_XML_CACHE_SELECT)
      .exec();

    return tenderDoc.populate(tenderCpvPopulateFields);
  }

  async upsertMultipleTenders(notices: TedNotice[]): Promise<TenderDocument[]> {
    const tenders: TenderDocument[] = (await Promise.all(
      notices.map((notice) => {
        return this.upsertTender(notice);
      }),
    ).then((documents) => documents.filter(Boolean))) as TenderDocument[];

    return tenders;
  }

  async saveNewTedTenders(
    notices: TedNotice[],
  ): Promise<SaveNewTedTendersResult> {
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
    const existingTenders = await TenderModel.find({
      id: { $in: publicationNumbers },
    })
      .select('id publicationNumber noticeVersion')
      .exec();

    const existingTendersByPublicationNumber = new Map(
      existingTenders.flatMap((tender) =>
        [tender.id, tender.publicationNumber]
          .filter((value): value is string => typeof value === 'string')
          .map((publicationNumber) => [publicationNumber, tender] as const),
      ),
    );
    let saved = 0;
    let updated = 0;
    let skipped = notices.length - noticesByPublicationNumber.size;
    const changedTenders: TenderDocument[] = [];

    for (const [publicationNumber, notice] of noticesByPublicationNumber) {
      const existingTender =
        existingTendersByPublicationNumber.get(publicationNumber);
      const shouldUpdateExistingTender =
        existingTender !== undefined &&
        this.shouldUpdateTenderFromTedNotice(existingTender, notice);

      if (existingTender !== undefined && !shouldUpdateExistingTender) {
        skipped += 1;
        continue;
      }

      const savedTender = await this.upsertTender(notice);

      if (savedTender) {
        changedTenders.push(savedTender);

        if (existingTender) {
          updated += 1;
        } else {
          saved += 1;
        }
      } else {
        skipped += 1;
      }
    }

    return { saved, updated, skipped, changedTenders };
  }

  private shouldUpdateTenderFromTedNotice(
    tender: Pick<TenderDocument, 'noticeVersion'>,
    notice: TedNotice,
  ): boolean {
    const noticeVersion = valueToString(
      notice.noticeVersion ?? notice['notice-version'],
    );

    return (
      areTedNoticeVersionsDifferent(tender.noticeVersion, notice) ||
      (tender.noticeVersion === undefined && noticeVersion !== undefined)
    );
  }

  async getLocalTenderWithBaseAnalysis(
    localTender: TenderDocument,
    isForceBaseAnalysis?: boolean,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    const generalAnalysis =
      await this.tenderGeneralAnalysisService.ensureAnalysisForTender(
        localTender,
        isForceBaseAnalysis,
      );

    // Disabled for now
    // if (!localTender.xmlContent) {
    //   const xmlContent = await fetchXmlContentFromNotice(localTender.links);
    //   localTender.xmlContent = xmlContent ?? '';
    //
    //   await localTender.save();
    // }

    localTender.set(
      'generalAnalysis',
      TenderGeneralAnalysisModel.serializeDetail(generalAnalysis),
      { strict: false },
    );

    return localTender.populate(tenderCpvPopulateFields);
  }

  async findMultipleLocalTendersWithBaseAnalysis(
    tenderQuery: Record<string, unknown>,
    options: {
      sort?: Record<string, SortOrder>;
      skip?: number;
      limit?: number;
    } = {},
  ): Promise<TenderDocumentWithGeneralAnalysis[]> {
    const localTenders = await TenderModel.find(tenderQuery)
      .sort(options.sort ?? {})
      .skip(options.skip ?? 0)
      .limit(options.limit ?? 0)
      .populate(tenderCpvPopulateFields)
      .exec();
    const generalAnalyses =
      await this.tenderGeneralAnalysisService.ensureBaseAnalysisForMultipleTenders(
        localTenders,
      );
    const generalAnalysesByTenderId = new Map(
      generalAnalyses.map((analysis) => [analysis.tenderId, analysis]),
    );

    return localTenders.map((tender) => {
      const generalAnalysis = generalAnalysesByTenderId.get(tender.id);

      tender.set(
        'generalAnalysis',
        TenderGeneralAnalysisModel.serializeDetail(generalAnalysis),
        { strict: false },
      );

      return tender;
    });
  }

  async findByTedIdOrCreateIfNeeded(id: string) {
    const localTender = await this.findLocalTender(id);

    if (localTender) {
      return localTender;
    }

    return this.findByIdOrFetchFromTed(id);
  }

  async findByIdOrFetchFromTed(
    id: string,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    const publicationNumber = id.trim();

    if (!isTedPublicationNumber(publicationNumber)) {
      throw new NotFoundException(`Tender ${id} not found`);
    }

    const [localTender, tedNotice] = await Promise.all([
      this.findLocalTender(id),
      this.fetchTedNoticeByPublicationNumber(publicationNumber),
    ]);

    const areVersionsDifferent = areTedNoticeVersionsDifferent(
      localTender?.noticeVersion,
      tedNotice,
    );

    if (localTender && !areVersionsDifferent) {
      return this.getLocalTenderWithBaseAnalysis(localTender);
    }

    if (!tedNotice) {
      throw new NotFoundException(`Tender ${id} not found`);
    }

    return this.upsertIfNeededTenderWithGeneralAnalysis(tedNotice);
  }

  async fetchTedNoticeByPublicationNumber(
    publicationNumber: string,
  ): Promise<TedNotice | undefined> {
    const response = await this.tedSearchService.searchNotices({
      query: `publication-number = ${publicationNumber}`,
      scope: TedScope.ALL,
      limit: 1,
      page: 1,
      paginationMode: TedPaginationMode.PAGE_NUMBER,
      onlyLatestVersions: true,
      checkQuerySyntax: false,
      fields: this.tenderDefaultFields,
    });

    return this.extractNotices(response)[0];
  }

  async searchTendersByPublicationNumbers(
    dto: TedPublicationNumbersSearchRequestDto,
  ): Promise<TedNotice[]> {
    const publicationNumbers = Array.from(new Set(dto.publicationNumbers));
    const quotedPublicationNumbers = publicationNumbers
      .map((publicationNumber) => `"${publicationNumber}"`)
      .join(', ');

    return this.tedSearchService
      .searchNotices({
        query: `publication-number IN (${quotedPublicationNumbers})`,
        scope: dto.scope ?? TedScope.ACTIVE,
        limit: dto.limit ?? 20,
        page: dto.page ?? 1,
        paginationMode: TedPaginationMode.PAGE_NUMBER,
        onlyLatestVersions: true,
        checkQuerySyntax: false,
        fields: this.tenderDefaultFields,
      })
      .then((response) => this.extractNotices(response).filter(Boolean));
  }

  extractNotices(response: TedSearchResponse): TedNotice[] {
    if (Array.isArray(response.notices)) {
      return response.notices;
    }

    const data = response.data;

    if (isRecord(data) && Array.isArray(data.notices)) {
      return data.notices.filter((notice): notice is TedNotice =>
        isTedNotice(notice),
      );
    }

    if (Array.isArray(response.results)) {
      return response.results.filter((notice): notice is TedNotice =>
        isTedNotice(notice),
      );
    }

    return [];
  }

  async upsertIfNeededTenderWithGeneralAnalysis(
    notice: TedNotice,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    const publicationNumber = extractPublicationNumberFromNotice(notice);

    if (!publicationNumber) {
      throw new NotFoundException('Tender publication number not found');
    }

    let savedTender: TenderDocument | null | undefined =
      await TenderModel.findOne({ id: publicationNumber })
        .select(TENDER_XML_CACHE_SELECT)
        .exec();

    if (!savedTender) {
      savedTender = await this.upsertTender(notice);
    }

    if (!savedTender) {
      throw new NotFoundException(`Tender ${publicationNumber} not found`);
    }

    const shouldUpsertTender = areTedNoticeVersionsDifferent(
      savedTender.noticeVersion,
      notice,
    );

    return this.getLocalTenderWithBaseAnalysis(savedTender, shouldUpsertTender);
  }

  async upsertIfNeededMultipleTendersWithGeneralAnalysis(notices: TedNotice[]) {
    return Promise.all(
      notices.map((notice) =>
        this.upsertIfNeededTenderWithGeneralAnalysis(notice),
      ),
    );
  }

  async findLocalTender(id: string): Promise<TenderDocument | null> {
    const publicationNumber = id.trim();

    return TenderModel.findOne({
      id: publicationNumber,
    })
      .select(TENDER_XML_CACHE_SELECT)
      .populate(tenderCpvPopulateFields)
      .exec();
  }

  toWholeTenderListDto(
    tender: TenderDocumentWithGeneralAnalysis,
  ): TenderListDto {
    const tenderList = TenderModel.serializeList(tender);

    return {
      ...tenderList,
      generalAnalysis: TenderGeneralAnalysisModel.serializeList(
        tenderList.generalAnalysis as TenderGeneralAnalysis,
      ),
    };
  }
}
