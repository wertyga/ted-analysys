import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
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
  extractPublicationNumberFromNotice,
  isRecord,
  isTedNotice,
  isTedPublicationNumber,
  valueToString,
} from '@/utils';
import { cpvCodesListFields } from '@/resources/ted-search/utils';

type TenderRecord = Tender & { _id?: unknown };
export type TenderListDto = Omit<TenderDto, 'links'>;
export type TenderDocumentWithGeneralAnalysis = TenderDocument & {
  generalAnalysis?: TenderGeneralAnalysisDetailDto | null;
};

@Injectable()
export class TendersService {
  private readonly logger = new Logger(TendersService.name);
  private readonly http: AxiosInstance = axios.create({
    timeout: 30000,
    headers: {
      Accept: 'application/xml, text/xml, text/plain, */*',
    },
  });

  tenderDefaultFields = [
    'publication-number',
    'notice-title',
    'publication-date',
    'deadline',
    'classification-cpv',
    'contract-nature',
    'procedure-type',
    'buyer-name',
    'buyer-country',
    'notice-type',
    'links',
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

    const noticeWithXml = await this.withXmlContent(notice);
    const baseDto = await this.tenderNormalizer.normalizeTedNoticeWithCpvCodes(
      notice,
      true,
    );
    const xmlFields =
      this.tenderNormalizer.parseTedNoticeXmlFields(noticeWithXml);
    const dto: TenderDto = {
      ...baseDto,
      ...xmlFields,
    };

    const tenderDoc = await TenderModel.findOneAndUpdate(
      { id: publicationNumber },
      {
        $set: {
          id: publicationNumber,
          source: 'TED',
          sourceNoticeId: publicationNumber,
          publicationNumber,
          noticeType: dto.noticeType,
          procedureType: dto.procedureType,
          title: dto.title,
          description: dto.description,
          estimatedValue: dto.estimatedValue,
          noticeLanguage: dto.noticeLanguage,
          submissionLanguages: dto.submissionLanguages,
          buyerName: dto.buyerName,
          buyerCountry: dto.buyerCountry,
          publicationDate: dto.publicationDate,
          submissionDeadline: dto.submissionDeadline,
          questionsDeadline: dto.questionsDeadline,
          plannedStartDate: dto.plannedStartDate,
          plannedEndDate: dto.plannedEndDate,
          contractNature: dto.contractNature,
          isDps: dto.isDps,
          isFrameworkAgreement: dto.isFrameworkAgreement,
          isSmeSuitable: dto.isSmeSuitable,
          electronicSubmission: dto.electronicSubmission,
          documentUrl: dto.documentUrl,
          classificationCpv: dto.classificationCpv,
          cpvCodes: dto.cpvCodes,
          links: dto.links,
        },
      },
      { returnDocument: 'after', upsert: true },
    ).exec();

    return tenderDoc.populate('classificationCpv');
  }

  async upsertMultipleTenders(notices: TedNotice[]): Promise<TenderDocument[]> {
    const tenders: TenderDocument[] = (await Promise.all(
      notices.map((notice) => {
        return this.upsertTender(notice);
      }),
    ).then((documents) => documents.filter(Boolean))) as TenderDocument[];

    return tenders;
  }

  private async withXmlContent(notice: TedNotice): Promise<TedNotice> {
    const xmlUrl = this.extractXmlUrl(notice);

    if (!xmlUrl) {
      return notice;
    }

    console.log({ xmlUrl });

    try {
      const response = await this.http.get<string>(xmlUrl, {
        responseType: 'text',
      });

      if (typeof response.data !== 'string' || response.data.length === 0) {
        return notice;
      }

      return {
        ...notice,
        xmlContent: response.data,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch TED XML from links.xml: ${xmlUrl}; ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );

      return notice;
    }
  }

  private findXmlContent(notice: TedNotice): string | undefined {
    for (const key of ['xmlContent', 'xml', 'content', 'noticeXml']) {
      const value = notice[key];

      if (typeof value === 'string' && value.includes('<')) {
        return value;
      }
    }

    return undefined;
  }

  private extractXmlUrl(notice: TedNotice): string | undefined {
    if (!isRecord(notice.links)) {
      return undefined;
    }

    return Object.values(notice.links?.xml ?? {})?.[0] as string;
  }

  async getLocalTenderWithBaseAnalysis(
    localTender: TenderDocument,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    const generalAnalysis =
      await this.tenderGeneralAnalysisService.ensureAnalysisForTender(
        localTender,
      );

    localTender.set(
      'generalAnalysis',
      this.tenderGeneralAnalysisService.toDetailDto(generalAnalysis),
      { strict: false },
    );

    return localTender.populate('classificationCpv');
  }

  async findByIdOrFetchFromTed(
    id: string,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    const localTender = await this.findLocalTender(id);

    if (localTender) {
      return this.getLocalTenderWithBaseAnalysis(localTender);
    }

    const publicationNumber = id.trim();

    if (!isTedPublicationNumber(publicationNumber)) {
      throw new NotFoundException(`Tender ${id} not found`);
    }

    const tedNotice =
      await this.fetchTedNoticeByPublicationNumber(publicationNumber);

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
      await TenderModel.findOne({ id: publicationNumber });

    if (!savedTender || this.shouldRefreshXmlDerivedFields(savedTender)) {
      savedTender = await this.upsertTender(notice);
    }

    if (!savedTender) {
      throw new NotFoundException(`Tender ${publicationNumber} not found`);
    }

    return this.getLocalTenderWithBaseAnalysis(savedTender);
  }

  private shouldRefreshXmlDerivedFields(tender: TenderDocument): boolean {
    return (
      tender.description === undefined &&
      tender.estimatedValue === undefined &&
      tender.noticeLanguage === undefined &&
      tender.submissionLanguages === undefined &&
      tender.questionsDeadline === undefined &&
      tender.plannedStartDate === undefined &&
      tender.plannedEndDate === undefined &&
      tender.isSmeSuitable === undefined &&
      tender.electronicSubmission === undefined &&
      tender.documentUrl === undefined
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
      .populate('classificationCpv', cpvCodesListFields)
      .exec();
  }

  mapTenderDocumentToDto(tender: TenderRecord): TenderDto {
    const dto: TenderDto = {
      id: tender.id,
      source: 'TED',
      sourceNoticeId: tender.sourceNoticeId,
      publicationNumber: tender.publicationNumber,
      noticeType: tender.noticeType,
      procedureType: tender.procedureType,
      title: tender.title,
      description: tender.description,
      estimatedValue: tender.estimatedValue,
      noticeLanguage: tender.noticeLanguage,
      submissionLanguages: tender.submissionLanguages,
      buyerName: tender.buyerName,
      buyerCountry: tender.buyerCountry,
      publicationDate: tender.publicationDate,
      submissionDeadline: tender.submissionDeadline,
      questionsDeadline: tender.questionsDeadline,
      plannedStartDate: tender.plannedStartDate,
      plannedEndDate: tender.plannedEndDate,
      contractNature: tender.contractNature,
      isDps: tender.isDps,
      isFrameworkAgreement: tender.isFrameworkAgreement,
      isSmeSuitable: tender.isSmeSuitable,
      electronicSubmission: tender.electronicSubmission,
      documentUrl: tender.documentUrl,
      classificationCpv:
        tender.classificationCpv as TenderDto['classificationCpv'],
      cpvCodes: tender.cpvCodes as TenderDto['cpvCodes'],
      links: tender.links,
    };

    return dto;
  }

  toListDto(tender: TenderRecord): TenderListDto {
    const { links, ...dto } = this.mapTenderDocumentToDto(tender);

    return dto;
  }
}
