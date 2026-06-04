import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
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
import { TenderDocument, TenderModel } from './schemas';
import {
  NormalizedTenderDto,
  TenderNormalizerService,
} from './tender-normalizer.service';
import {
  areTedNoticeVersionsDifferent,
  extractPublicationNumberFromNotice,
  isRecord,
  isTedNotice,
  isTedPublicationNumber,
} from '@/utils';
import { tenderCpvPopulateFields } from '@/resources/tenders/utils/tender.utils';
import { SortOrder, Types } from 'mongoose';
import {
  TenderDeepAnalysisDocument,
  TenderDeepAnalysisModel,
} from '@/resources/tender-deep-analysis/schemas';
import {
  TenderWishlistItemDocument,
  TenderWishlistItemModel,
} from '@/resources/tender-wishlist/schemas';
import { CurrencyExchangeRatesService } from '@/resources/currency-exchange-rates/currency-exchange-rates.service';
import { CurrencySign } from '@/resources/codelist';
import { searchTendersDefaultFields } from '@/resources/ted-search/utils';

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
  private readonly logger = new Logger(TendersService.name);

  constructor(
    @Inject(forwardRef(() => TedSearchService))
    private readonly tedSearchService: TedSearchService,
    private readonly tenderNormalizer: TenderNormalizerService,
    private readonly currencyExchangeRatesService: CurrencyExchangeRatesService,
    @Inject(forwardRef(() => TenderGeneralAnalysisService))
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  async upsertTender(notice: TedNotice): Promise<TenderDocument | undefined> {
    const publicationNumber = extractPublicationNumberFromNotice(notice);

    if (!publicationNumber) {
      return undefined;
    }

    const normalizedTender = this.tenderNormalizer.normalizeTedNotice(notice);

    const normalizedTenderDto =
      await this.tenderNormalizer.normalizeTedNoticeWithCpvCodes(
        notice,
        true,
        normalizedTender,
      );

    const estimatedValueEur =
      await this.calculateEstimatedValueEur(normalizedTender);

    const sourceHash = this.buildTenderSourceHash(normalizedTender);

    const tenderDoc = await TenderModel.findOneAndUpdate(
      { id: publicationNumber },
      {
        $set: {
          ...normalizedTenderDto,
          id: publicationNumber,
          publicationNumber,
          estimatedValueEur,
          sourceHash,
        },
      },
      { returnDocument: 'after', upsert: true, strict: false },
    ).exec();

    return tenderDoc.populate(tenderCpvPopulateFields);
  }

  async calculateEstimatedValueEur(
    tender: Pick<
      TenderDocument | NormalizedTenderDto,
      'estimatedValue' | 'publicationDate'
    >,
  ): Promise<number | null> {
    const amount = tender.estimatedValue?.amount;
    const currency = tender.estimatedValue?.currency;

    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      typeof currency !== 'string'
    ) {
      return null;
    }

    const normalizedCurrency = currency.trim().toUpperCase() as CurrencySign;

    if (!Object.values(CurrencySign).includes(normalizedCurrency)) {
      return null;
    }

    const estimatedValueEur =
      await this.currencyExchangeRatesService.convertToEur(
        amount,
        normalizedCurrency,
        tender.publicationDate,
      );

    return estimatedValueEur === null ? null : Math.round(estimatedValueEur);
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
      .select('id publicationNumber noticeVersion sourceHash')
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

      const shouldUpdateExistingTender = this.shouldUpdateTenderFromTedNotice(
        existingTender,
        notice,
      );

      if (existingTender && !shouldUpdateExistingTender) {
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
    tender: TenderDocument | undefined | null,
    notice: TedNotice,
  ): boolean {
    if (!tender) {
      return true;
    }

    const normalizedTenderDto =
      this.tenderNormalizer.normalizeTedNotice(notice);

    const sourceHash = this.buildTenderSourceHash(normalizedTenderDto);

    return tender.sourceHash !== sourceHash;
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

    localTender.set(
      'generalAnalysis',
      TenderGeneralAnalysisModel.serializeDetail(generalAnalysis),
      { strict: false },
    );

    return localTender.populate(tenderCpvPopulateFields);
  }

  async getNormalizedTenderWithBaseAnalysis(tedTender: any) {
    tedTender._id = new Types.ObjectId().toHexString();
    const generalAnalysis =
      await this.tenderGeneralAnalysisService.ensureAnalysisForTender(
        tedTender as any,
      );

    tedTender.generalAnalysis =
      TenderGeneralAnalysisModel.serializeDetail(generalAnalysis);

    return tedTender;
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
      fields: searchTendersDefaultFields,
    });

    return this.extractNotices(response)[0];
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
      await TenderModel.findOne({ id: publicationNumber }).exec();

    const shouldUpsertTender = this.shouldUpdateTenderFromTedNotice(
      savedTender,
      notice,
    );

    if (shouldUpsertTender) {
      savedTender = await this.upsertTender(notice);
    }

    if (!savedTender) {
      throw new NotFoundException(`Tender ${publicationNumber} not found`);
    }

    return this.getLocalTenderWithBaseAnalysis(savedTender, shouldUpsertTender);
  }

  async upsertIfNeededMultipleTendersWithGeneralAnalysis(notices: TedNotice[]) {
    const results = await Promise.allSettled(
      notices.map((notice) =>
        this.upsertIfNeededTenderWithGeneralAnalysis(notice),
      ),
    );

    return results.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return [result.value];
      }

      this.logger.warn(
        `Skipping TED notice after local upsert failed: index=${index} error=${
          result.reason instanceof Error
            ? result.reason.message
            : 'unknown error'
        }`,
      );

      return [];
    });
  }

  async findLocalTender(id: string): Promise<TenderDocument | null> {
    const publicationNumber = id.trim();

    return TenderModel.findOne({
      id: publicationNumber,
    })
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

  async fillUpTenderByDeepAnalysisStatus<
    T extends { id: string; deepAnalysisStatus?: string | null },
  >(tenders: T[], userId?: string) {
    const deepAnalysisMap: Map<string, TenderDeepAnalysisDocument> = new Map();

    if (userId) {
      await TenderDeepAnalysisModel.find({
        company: userId,
      })
        .select('status tenderId')
        .then((analysis) => {
          analysis.forEach((analyse) => {
            deepAnalysisMap.set(analyse.tenderId, analyse);
          });
        });
    }

    tenders.forEach((tender: any) => {
      const deepAnalysisStatus = deepAnalysisMap.get(tender.id)?.status ?? null;

      tender.deepAnalysisStatus = deepAnalysisStatus;
    });
  }

  async fillUpTenderListByDeepAnalysisAndWishListStatus<
    T extends {
      id: string;
      deepAnalysisStatus?: string | null;
      isInWishlist?: boolean;
    },
  >(tenders: T[], userId?: string) {
    const deepAnalysisMap: Map<string, TenderDeepAnalysisDocument> = new Map();
    const wishListMap: Map<string, TenderWishlistItemDocument> = new Map();

    if (userId) {
      await Promise.all([
        TenderDeepAnalysisModel.find({
          company: userId,
          tenderId: { $in: tenders.map(({ id }) => id) },
        })
          .select('status tenderId')
          .lean(),
        TenderWishlistItemModel.find({
          user: userId,
          tenderId: { $in: tenders.map(({ id }) => id) },
        })
          .select('tenderId')
          .lean(),
      ]).then(([analysis, wishlist]) => {
        analysis.forEach((analyse) => {
          deepAnalysisMap.set(analyse.tenderId, analyse);
        });
        wishlist.forEach((wishItem) => {
          wishListMap.set(wishItem.tenderId, wishItem);
        });
      });
    }

    tenders.forEach((tender: any) => {
      const deepAnalysisStatus = deepAnalysisMap.get(tender.id)?.status ?? null;
      const isInWishlist = !!wishListMap.get(tender.id);

      tender.deepAnalysisStatus = deepAnalysisStatus;
      tender.isInWishlist = isInWishlist;
    });
  }

  private buildTenderSourceHash(normalizedTender: NormalizedTenderDto): string {
    return createHash('sha256')
      .update(JSON.stringify(normalizedTender))
      .digest('hex');
  }
}
