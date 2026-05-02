import { Injectable, NotFoundException } from '@nestjs/common';
import { TedSearchService } from '../ted-search/ted-search.service';
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

type TenderRecord = Tender & { _id?: unknown };

@Injectable()
export class TendersService {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tenderNormalizer: TenderNormalizerService,
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  async findByIdOrFetchFromTed(id: string): Promise<TenderDto> {
    const localTender = await this.findLocalTender(id);

    if (localTender) {
      const dto = this.mapTenderDocumentToDto(localTender);

      this.tenderGeneralAnalysisService.ensureAnalyzedForTender(
        localTender as TenderDocument,
      );

      return dto;
    }

    const publicationNumber = id.trim();

    if (!this.isTedPublicationNumber(publicationNumber)) {
      throw new NotFoundException(`Tender ${id} not found`);
    }

    const tedNotice =
      await this.fetchTedNoticeByPublicationNumber(publicationNumber);

    if (tedNotice === null) {
      throw new NotFoundException(`Tender ${id} not found`);
    }

    const dto = await this.tenderNormalizer.normalizeTedNotice(tedNotice);
    const normalizedDto = this.ensureTedIdentity(dto, publicationNumber);

    await this.upsertTender(normalizedDto);

    return normalizedDto;
  }

  async fetchTedNoticeByPublicationNumber(
    publicationNumber: string,
  ): Promise<TedNotice | null> {
    const response = await this.tedSearchService.searchNotices({
      query: `publication-number = ${publicationNumber}`,
      scope: TedScope.ALL,
      limit: 1,
      page: 1,
      paginationMode: TedPaginationMode.PAGE_NUMBER,
      onlyLatestVersions: true,
      checkQuerySyntax: false,
      fields: [
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
      ],
    });

    return this.extractNotices(response)[0] ?? null;
  }

  extractNotices(response: TedSearchResponse): TedNotice[] {
    if (Array.isArray(response.notices)) {
      return response.notices;
    }

    const data = response.data;

    if (this.isRecord(data) && Array.isArray(data.notices)) {
      return data.notices.filter((notice): notice is TedNotice =>
        this.isTedNotice(notice),
      );
    }

    if (Array.isArray(response.results)) {
      return response.results.filter((notice): notice is TedNotice =>
        this.isTedNotice(notice),
      );
    }

    return [];
  }

  ensureTedIdentity(dto: TenderDto, publicationNumber: string): TenderDto {
    return {
      ...dto,
      id: publicationNumber,
      source: 'TED',
      sourceNoticeId: publicationNumber,
      publicationNumber: dto.publicationNumber ?? publicationNumber,
    };
  }

  async upsertTender(dto: TenderDto): Promise<void> {
    const now = new Date();

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
            lastSeenAt: now,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { new: true, upsert: true },
      ).exec();
    }

    // Async update general analysis
    this.tenderGeneralAnalysisService.ensureAnalyzedForTender(savedTender);
  }

  async findLocalTender(id: string): Promise<TenderRecord | null> {
    const publicationNumber = id.trim();

    return TenderModel.findOne({
      $or: [
        { id: publicationNumber },
        { publicationNumber },
        { sourceNoticeId: publicationNumber },
      ],
    })
      .lean<TenderRecord>()
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

    const publicationNumber =
      dto.publicationNumber ?? tender.publicationNumber ?? tender.id;

    return this.ensureTedIdentity(dto, publicationNumber);
  }

  private isTedPublicationNumber(value: string): boolean {
    return /^\d{5,8}-\d{4}$/.test(value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isTedNotice(value: unknown): value is TedNotice {
    return this.isRecord(value);
  }
}
