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
import { TenderDto } from './dto/tender.dto';
import { Tender, TenderDocument, TenderModel } from './schemas';
import { TenderNormalizerService } from './tender-normalizer.service';
import { TedPublicationNumbersSearchRequestDto } from '@/resources/ted-search/dto/ted-publication-numbers-search-request.dto';
import {
  areTedNoticeVersionsDifferent,
  extractPublicationNumberFromNotice,
  isRecord,
  isTedNotice,
  isTedPublicationNumber,
} from '@/utils';
import { CPV_CODES_LIST_FIELDS } from '@/resources/cpv/cpv.service';

type TenderRecord = Tender & { _id?: unknown };
const tenderCpvPopulateFields = [
  { path: 'classificationCpv', select: CPV_CODES_LIST_FIELDS },
  { path: 'mainClassificationProc', select: CPV_CODES_LIST_FIELDS },
  { path: 'mainClassificationLot', select: CPV_CODES_LIST_FIELDS },
  { path: 'additionalClassificationLot', select: CPV_CODES_LIST_FIELDS },
];
export type TenderListDto = Omit<
  TenderDto,
  | 'links'
  | 'sourceNoticeId'
  | 'noticeVersion'
  | 'titleProc'
  | 'titleLot'
  | 'descriptionLot'
  | 'buyerIdentifier'
  | 'buyerCity'
  | 'buyerEmail'
  | 'buyerInternetAddress'
  | 'buyerProfile'
  | 'dispatchDate'
  | 'deadlineReceiptTender'
  | 'durationPeriodValue'
  | 'durationPeriodUnit'
  | 'legalBasis'
  | 'additionalClassificationLot'
  | 'lotIdentifiers'
  | 'internalLotIdentifiers'
  | 'submissionUrls'
  | 'selectionCriteria'
  | 'awardCriteria'
>;
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
    ).exec();

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
      this.tenderGeneralAnalysisService.toDetailDto(generalAnalysis),
      { strict: false },
    );

    return localTender.populate(tenderCpvPopulateFields);
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

    return this.upsertIfNeededTenderWithGeneralAnalysis(
      tedNotice,
      areVersionsDifferent,
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
    isForceBaseAnalysis = false,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    const publicationNumber = extractPublicationNumberFromNotice(notice);

    if (!publicationNumber) {
      throw new NotFoundException('Tender publication number not found');
    }

    let savedTender: TenderDocument | null | undefined =
      await TenderModel.findOne({ id: publicationNumber });
    const shouldUpsertTender =
      !savedTender ||
      areTedNoticeVersionsDifferent(savedTender.noticeVersion, notice);

    if (shouldUpsertTender) {
      savedTender = await this.upsertTender(notice);
    }

    if (!savedTender) {
      throw new NotFoundException(`Tender ${publicationNumber} not found`);
    }

    return this.getLocalTenderWithBaseAnalysis(
      savedTender,
      isForceBaseAnalysis,
    );
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
      $or: [
        { id: publicationNumber },
        { publicationNumber },
        { sourceNoticeId: publicationNumber },
      ],
    })
      .populate(tenderCpvPopulateFields)
      .exec();
  }

  mapTenderDocumentToDto(tender: TenderRecord): TenderDto {
    const dto: TenderDto = {
      id: tender.id,
      source: 'TED',
      sourceNoticeId: tender.sourceNoticeId,
      publicationNumber: tender.publicationNumber,
      noticeType: tender.noticeType,
      noticeSubtype: tender.noticeSubtype,
      noticeVersion: tender.noticeVersion,
      procedureType: tender.procedureType,
      title: tender.title,
      titleProc: tender.titleProc,
      titleLot: tender.titleLot,
      description: tender.description,
      descriptionLot: tender.descriptionLot,
      estimatedValue: tender.estimatedValue,
      noticeLanguage: tender.noticeLanguage,
      submissionLanguages: tender.submissionLanguages,
      buyerName: tender.buyerName,
      buyerIdentifier: tender.buyerIdentifier,
      buyerCountry: tender.buyerCountry,
      buyerCity: tender.buyerCity,
      buyerEmail: tender.buyerEmail,
      buyerInternetAddress: tender.buyerInternetAddress,
      buyerProfile: tender.buyerProfile,
      publicationDate: tender.publicationDate,
      dispatchDate: tender.dispatchDate,
      submissionDeadline: tender.submissionDeadline,
      deadlineReceiptTender: tender.deadlineReceiptTender,
      questionsDeadline: tender.questionsDeadline,
      plannedStartDate: tender.plannedStartDate,
      plannedEndDate: tender.plannedEndDate,
      durationPeriodValue: tender.durationPeriodValue,
      durationPeriodUnit: tender.durationPeriodUnit,
      contractNature: tender.contractNature,
      legalBasis: tender.legalBasis,
      isDps: tender.isDps,
      isFrameworkAgreement: tender.isFrameworkAgreement,
      isSmeSuitable: tender.isSmeSuitable,
      electronicSubmission: tender.electronicSubmission,
      mainClassificationProc:
        tender.mainClassificationProc as TenderDto['mainClassificationProc'],
      mainClassificationLot:
        tender.mainClassificationLot as TenderDto['mainClassificationLot'],
      additionalClassificationLot:
        tender.additionalClassificationLot as TenderDto['additionalClassificationLot'],
      placeOfPerformanceCountries: tender.placeOfPerformanceCountries,
      placeOfPerformanceCities: tender.placeOfPerformanceCities,
      lotIdentifiers: tender.lotIdentifiers,
      internalLotIdentifiers: tender.internalLotIdentifiers,
      documentUrls: tender.documentUrls,
      submissionUrls: tender.submissionUrls,
      euFundLot: tender.euFundLot,
      selectionCriteria: tender.selectionCriteria,
      awardCriteria: tender.awardCriteria,
      classificationCpv:
        tender.classificationCpv as TenderDto['classificationCpv'],
      cpvCodes: tender.cpvCodes as TenderDto['cpvCodes'],
      links: tender.links,
    };

    return dto;
  }

  toListDto(tender: TenderRecord): TenderListDto {
    const {
      links,
      sourceNoticeId,
      noticeVersion,
      titleProc,
      titleLot,
      descriptionLot,
      buyerIdentifier,
      buyerCity,
      buyerEmail,
      buyerInternetAddress,
      buyerProfile,
      dispatchDate,
      deadlineReceiptTender,
      durationPeriodValue,
      durationPeriodUnit,
      legalBasis,
      additionalClassificationLot,
      lotIdentifiers,
      internalLotIdentifiers,
      submissionUrls,
      selectionCriteria,
      awardCriteria,
      cpvCodes,
      ...dto
    } = this.mapTenderDocumentToDto(tender);

    return dto;
  }

  toDetailDto(tender: TenderDocument) {
    const { cpvCodes, ...dto } = this.mapTenderDocumentToDto(tender);

    return dto;
  }
}
