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
  TenderGeneralAnalysisDocument,
  TenderGeneralAnalysisModel,
} from '../tender-analysis/schemas';
import { TenderListDto } from './dto/tender.dto';
import { TenderDocument, TenderLot, TenderModel } from './schemas';
import {
  NormalizedTenderDto,
  NormalizedTenderLot,
  TenderNormalizerService,
} from '@/resources/tender-normalizer/tender-normalizer.service';
import {
  extractPublicationNumberFromNotice,
  isRecord,
  isTedNotice,
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
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import { TENDER_COMPETITION_SEARCH_FIELDS } from '@/config/ted-search.config';

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

const SHORT_TITLE_GENERATION_BATCH_SIZE = 20;
const OPTIONAL_TENDER_UNSET_FIELDS = [
  'noticeSubtype',
  'noticeVersion',
  'description',
  'buyerInternetAddress',
  'buyerProfile',
  'deadlineReceiptTender',
  'questionsDeadline',
  'plannedStartDate',
  'plannedEndDate',
  'duration',
  'electronicSubmission',
  'isSmeSuitable',
  'euFundLot',
] as const;

@Injectable()
export class TendersService {
  private readonly logger = new Logger(TendersService.name);

  constructor(
    @Inject(forwardRef(() => TedSearchService))
    private readonly tedSearchService: TedSearchService,
    private readonly tenderNormalizer: TenderNormalizerService,
    private readonly currencyExchangeRatesService: CurrencyExchangeRatesService,
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
    @Inject(forwardRef(() => TenderGeneralAnalysisService))
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  async upsertTender(notice: TedNotice): Promise<TenderDocument | undefined> {
    const normalizedTender = this.tenderNormalizer.normalizeTedNotice(notice);
    if (!normalizedTender.id) {
      return;
    }

    const [estimatedValueEur, lotsWithEur] = await Promise.all([
      this.calculateEstimatedValueEur(normalizedTender),
      this.getLotsWithEurValues(normalizedTender.lots),
    ]);

    const sourceHash = this.buildTenderSourceHash(normalizedTender);
    const tenderSet = this.omitUndefinedFields({
      ...normalizedTender,
      lots: lotsWithEur,
      estimatedValueEur,
    });
    const tenderUnset = this.buildTenderUnset(normalizedTender);

    const tenderDoc = await TenderModel.findOneAndUpdate(
      { id: normalizedTender.id },
      {
        $set: tenderSet,
        $setOnInsert: {
          sourceHash,
        },
        $unset: tenderUnset,
      },
      { returnDocument: 'after', upsert: true, strict: false },
    );

    return tenderDoc;
  }

  private async getLotsWithEurValues(
    lots: NormalizedTenderLot[],
    publicationDate?: Date,
  ): Promise<TenderLot[]> {
    const lotsEur: (number | null)[] = await Promise.all(
      lots.map((lot) => {
        const { estimatedValue } = lot;

        return this._calculateEstimatedValueEur(
          estimatedValue?.amount,
          estimatedValue?.currency,
          publicationDate,
        );
      }),
    );

    return lots.map((lot, i) => {
      return {
        ...lot,
        estimatedValueEur: lotsEur[i],
      };
    });
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

    return this._calculateEstimatedValueEur(
      amount,
      normalizedCurrency,
      tender.publicationDate,
    );
  }

  async _calculateEstimatedValueEur(
    amount: number | null | undefined,
    cur: string | null | undefined,
    date?: Date,
  ) {
    if (!amount || !cur || !Object.values(CurrencySign).includes(cur as any)) {
      return null;
    }

    const estimatedValueEur =
      await this.currencyExchangeRatesService.convertToEur(amount, cur, date);

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
      .select('id noticeVersion sourceHash title shortTitle')
      .exec();

    const existingTendersByPublicationNumber = new Map(
      existingTenders.map((tender) => [tender.id, tender] as const),
    );
    let saved = 0;
    let updated = 0;
    let skipped = notices.length - noticesByPublicationNumber.size;
    const changedTenders: TenderDocument[] = [];
    const tendersForShortTitle: TenderDocument[] = [];

    for (const [publicationNumber, notice] of noticesByPublicationNumber) {
      const existingTender =
        existingTendersByPublicationNumber.get(publicationNumber);

      const shouldUpdateExistingTender = this.shouldUpdateTenderFromTedNotice(
        existingTender,
        notice,
      );

      if (existingTender && !shouldUpdateExistingTender) {
        if (!this.hasCompleteShortTitle(existingTender.shortTitle)) {
          tendersForShortTitle.push(existingTender);
        }

        skipped += 1;
        continue;
      }

      const savedTender = await this.upsertTender(notice);

      if (savedTender) {
        if (!this.hasCompleteShortTitle(savedTender.shortTitle)) {
          tendersForShortTitle.push(savedTender);
        }

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

    await this.fillMissingShortTitles(tendersForShortTitle);

    return { saved, updated, skipped, changedTenders };
  }

  private async fillMissingShortTitles(
    tenders: Array<Pick<TenderDocument, 'id' | 'title' | 'shortTitle'>>,
  ) {
    const tendersWithoutShortTitle = tenders.filter((tender) => {
      return tender.title && !this.hasCompleteShortTitle(tender.shortTitle);
    });

    if (!tendersWithoutShortTitle.length) {
      return;
    }

    for (
      let index = 0;
      index < tendersWithoutShortTitle.length;
      index += SHORT_TITLE_GENERATION_BATCH_SIZE
    ) {
      const batch = tendersWithoutShortTitle.slice(
        index,
        index + SHORT_TITLE_GENERATION_BATCH_SIZE,
      );

      try {
        const generated =
          await this.deepSeekAnalysisService.generateTenderShortTitles(
            batch.map((tender) => ({
              id: tender.id,
              title: tender.title ?? '',
            })),
          );
        const byId = new Map(generated.map((item) => [item.id, item]));

        await Promise.all(
          batch.map(async (tender) => {
            const item = byId.get(tender.id);

            if (!item) {
              this.logger.warn(
                `DeepSeek short title response did not include tender ${tender.id}`,
              );

              return;
            }

            const updatedTender = await TenderModel.findOneAndUpdate(
              {
                id: tender.id,
                ...this.buildMissingShortTitleQuery(),
              },
              { $set: { shortTitle: item.shortTitle } },
              { returnDocument: 'after' },
            ).exec();

            tender.shortTitle = updatedTender?.shortTitle ?? item.shortTitle;
          }),
        );
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to generate tender short titles: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
  }

  private hasCompleteShortTitle(
    value: TenderDocument['shortTitle'] | undefined,
  ): boolean {
    return Boolean(value?.en && value.de && value.fr && value.pl && value.ru);
  }

  private buildMissingShortTitleQuery() {
    return {
      $or: [
        { shortTitle: { $exists: false } },
        { shortTitle: null },
        { 'shortTitle.en': { $exists: false } },
        { 'shortTitle.de': { $exists: false } },
        { 'shortTitle.fr': { $exists: false } },
        { 'shortTitle.pl': { $exists: false } },
        { 'shortTitle.ru': { $exists: false } },
        { 'shortTitle.en': '' },
        { 'shortTitle.de': '' },
        { 'shortTitle.fr': '' },
        { 'shortTitle.pl': '' },
        { 'shortTitle.ru': '' },
      ],
    };
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
    withoutBaseAnalysisGenerating: boolean,
    isForceBaseAnalysis?: boolean,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    let generalAnalysis: TenderGeneralAnalysisDocument | null = null;

    if (withoutBaseAnalysisGenerating) {
      generalAnalysis = await TenderGeneralAnalysisModel.findOne({
        tenderId: localTender.id,
      });
    } else {
      generalAnalysis =
        await this.tenderGeneralAnalysisService.ensureAnalysisForTender(
          localTender,
          isForceBaseAnalysis,
        );
    }

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

  async fineLocalTenders(
    tenderQuery: Record<string, unknown>,
    options: {
      sort?: Record<string, SortOrder>;
      skip?: number;
      limit?: number;
    } = {},
  ) {
    return TenderModel.find(tenderQuery)
      .sort(options.sort ?? {})
      .skip(options.skip ?? 0)
      .limit(options.limit ?? 0)
      .populate(tenderCpvPopulateFields);
  }

  async findMultipleLocalTendersWithBaseAnalysis(
    tenderQuery: Record<string, unknown>,
    options: {
      sort?: Record<string, SortOrder>;
      skip?: number;
      limit?: number;
    } = {},
    withoutBaseAnalysisGenerating?: boolean,
  ): Promise<TenderDocumentWithGeneralAnalysis[]> {
    const localTenders = await this.fineLocalTenders(tenderQuery, options);

    let generalAnalyses: TenderGeneralAnalysisDocument[] = [];

    if (withoutBaseAnalysisGenerating) {
      generalAnalyses = await TenderGeneralAnalysisModel.find({
        tenderId: { $in: localTenders.map((t) => t.id) },
      });
    } else {
      generalAnalyses =
        await this.tenderGeneralAnalysisService.ensureBaseAnalysisForMultipleTenders(
          localTenders,
        );
    }

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

  async findById(
    id: string,
    withoutBaseAnalysisGenerating: boolean,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    const tender = await this.findLocalTender(id);

    if (!tender) {
      throw new NotFoundException(`Tender ${id} not found`);
    }

    return this.getLocalTenderWithBaseAnalysis(
      tender,
      withoutBaseAnalysisGenerating,
    );
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
      fields: TENDER_COMPETITION_SEARCH_FIELDS,
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

    return this.getLocalTenderWithBaseAnalysis(
      savedTender,
      false,
      shouldUpsertTender,
    );
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

  buildTenderSourceHash(normalizedTender: NormalizedTenderDto): string {
    return createHash('sha256')
      .update(JSON.stringify(normalizedTender))
      .digest('hex');
  }

  private omitUndefinedFields<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, fieldValue]) => fieldValue !== undefined,
      ),
    ) as T;
  }

  private buildTenderUnset(
    normalizedTender: NormalizedTenderDto,
  ): Record<string, ''> {
    const unset: Record<string, ''> = {
      classificationCpv: '',
      publicationNumber: '',
      titleLot: '',
      descriptionLot: '',
      mainClassificationLot: '',
      additionalClassificationLot: '',
      buyerAuthorityMainActivities: '',
      buyerEntityMainActivities: '',
      buyerLegalTypes: '',
    };

    for (const field of OPTIONAL_TENDER_UNSET_FIELDS) {
      if (normalizedTender[field] === undefined) {
        unset[field] = '';
      }
    }

    return unset;
  }
}
