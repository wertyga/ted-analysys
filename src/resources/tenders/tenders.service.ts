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
  extractPublicationNumberFromNotice,
  isRecord,
  isTedNotice,
  isTedPublicationNumber,
  valueToString,
} from '@/utils';

type TenderRecord = Tender & { _id?: unknown };
export type TenderDocumentWithGeneralAnalysis = TenderDocument & {
  generalAnalysis?: TenderGeneralAnalysisDetailDto | null;
};

@Injectable()
export class TendersService {
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

  async upsertMultipleTenders(notices: TedNotice[]): Promise<TenderDocument[]> {
    const tenders: TenderDocument[] = (await Promise.all(
      notices.map((notice) => {
        const publicationNumber = extractPublicationNumberFromNotice(notice);

        if (!publicationNumber) {
          return undefined;
        }

        return TenderModel.findOneAndUpdate(
          { id: publicationNumber },
          {
            $set: {
              id: publicationNumber,
              source: 'TED',
              sourceNoticeId: publicationNumber,
              publicationNumber,
              noticeType: valueToString(notice.noticeType),
              procedureType: valueToString(notice.procedureType),
              title: valueToString(notice.noticeTitle ?? notice.title),
              buyerName: valueToString(notice.buyerName),
              buyerCountry: valueToString(notice.buyerCountry),
              publicationDate: valueToString(notice.publicationDate),
              submissionDeadline: valueToString(notice.deadline),
              contractNature: valueToString(notice.contractNature),
              classificationCpv: Array.isArray(notice.classificationCpv)
                ? notice.classificationCpv
                : undefined,
              cpvCodes: Array.isArray(notice.classificationCpv)
                ? notice.classificationCpv
                : undefined,
              links: notice.links,
            },
          },
          { returnDocument: 'after', upsert: true },
        ).exec();
      }),
    ).then((documents) => documents.filter(Boolean))) as TenderDocument[];

    return tenders;
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

    return localTender as TenderDocumentWithGeneralAnalysis;
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

    return this.upsertTenderWithGeneralAnalysis(tedNotice);
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

  async upsertTenderWithGeneralAnalysis(
    notice: TedNotice,
  ): Promise<TenderDocumentWithGeneralAnalysis> {
    const dto = await this.tenderNormalizer.normalizeTedNotice(notice);
    let savedTender = await TenderModel.findOne({ id: dto.id });

    if (!savedTender) {
      savedTender = await TenderModel.findOneAndUpdate(
        { id: dto.id },
        {
          $set: {
            id: dto.id,
            source: dto.source,
            sourceNoticeId: dto.sourceNoticeId,
            publicationNumber: dto.publicationNumber,
            noticeType: dto.noticeType,
            procedureType: dto.procedureType,
            title: dto.title,
            buyerName: dto.buyerName,
            buyerCountry: dto.buyerCountry,
            publicationDate: dto.publicationDate,
            submissionDeadline: dto.submissionDeadline,
            classificationCpv: dto.classificationCpv,
            cpvCodes: dto.cpvCodes,
            contractNature: dto.contractNature,
            links: dto.links,
          },
        },
        { returnDocument: 'after', upsert: true },
      ).exec();
    }

    if (!savedTender) {
      throw new NotFoundException(`Tender ${dto.id} not found`);
    }

    return this.getLocalTenderWithBaseAnalysis(savedTender);
  }

  async findLocalTender(id: string): Promise<TenderDocument | null> {
    const publicationNumber = id.trim();

    return TenderModel.findOne({
      $or: [
        { id: publicationNumber },
        { publicationNumber },
        { sourceNoticeId: publicationNumber },
      ],
    }).exec();
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
      buyerName: tender.buyerName,
      buyerCountry: tender.buyerCountry,
      publicationDate: tender.publicationDate,
      submissionDeadline: tender.submissionDeadline,
      contractNature: tender.contractNature,
      classificationCpv:
        tender.classificationCpv as TenderDto['classificationCpv'],
      cpvCodes: tender.cpvCodes as TenderDto['cpvCodes'],
      links: tender.links,
    };

    return dto;
  }
}
