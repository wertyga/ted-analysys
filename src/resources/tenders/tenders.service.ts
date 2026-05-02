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

  async findById(id: string, includeRaw = false): Promise<TenderDto> {
    return this.findByIdOrFetchFromTed(id, { includeRaw });
  }

  async findByIdOrFetchFromTed(
    id: string,
    options: { includeRaw?: boolean } = {},
  ): Promise<TenderDto> {
    const localTender = await this.findLocalTender(id);

    if (localTender) {
      const dto = this.mapTenderDocumentToDto(localTender, {
        includeRaw: options.includeRaw ?? false,
      });

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

    const dto = await this.tenderNormalizer.normalizeTedNotice(tedNotice, {
      includeRaw: options.includeRaw ?? false,
    });
    const normalizedDto = this.ensureTedIdentity(dto, publicationNumber);

    await this.upsertTender(normalizedDto, tedNotice);

    return options.includeRaw === true
      ? normalizedDto
      : this.withoutRaw(normalizedDto);
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

  async upsertTender(dto: TenderDto, raw: unknown): Promise<void> {
    const now = new Date();

    const savedTender = await TenderModel.findOneAndUpdate(
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
          rawJson: raw,
          normalizedJson: this.withoutRaw(dto),
          lastSeenAt: now,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { new: true, upsert: true },
    ).exec();

    await this.tenderGeneralAnalysisService.ensureAnalyzedForTender(
      savedTender,
    );
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

  mapTenderDocumentToDto(
    tender: TenderRecord,
    options: { includeRaw?: boolean },
  ): TenderDto {
    const normalizedJson = this.isRecord(tender.normalizedJson)
      ? tender.normalizedJson
      : {};
    const dto: TenderDto = {
      ...normalizedJson,
      id: this.valueToString(normalizedJson.id) ?? tender.id,
      source: 'TED',
      sourceNoticeId:
        this.valueToString(normalizedJson.sourceNoticeId) ??
        tender.sourceNoticeId,
      publicationNumber:
        this.valueToString(normalizedJson.publicationNumber) ??
        tender.publicationNumber,
      noticeType:
        this.valueToString(normalizedJson.noticeType) ?? tender.noticeType,
      procedureType:
        this.valueToString(normalizedJson.procedureType) ??
        tender.procedureType,
      title: this.valueToString(normalizedJson.title) ?? tender.title,
      buyerName:
        this.valueToString(normalizedJson.buyerName) ?? tender.buyerName,
      buyerCountry:
        this.valueToString(normalizedJson.buyerCountry) ?? tender.buyerCountry,
      publicationDate:
        this.valueToString(normalizedJson.publicationDate) ??
        tender.publicationDate,
      submissionDeadline:
        this.valueToString(normalizedJson.submissionDeadline) ??
        tender.submissionDeadline,
      contractNature:
        this.valueToString(normalizedJson.contractNature) ??
        tender.contractNature,
      classificationCpv: (Array.isArray(normalizedJson.classificationCpv)
        ? normalizedJson.classificationCpv
        : tender.classificationCpv) as TenderDto['classificationCpv'],
      cpvCodes: (Array.isArray(normalizedJson.cpvCodes)
        ? normalizedJson.cpvCodes
        : tender.cpvCodes) as TenderDto['cpvCodes'],
      links: normalizedJson.links ?? tender.links,
    };

    if (options.includeRaw === true) {
      dto.raw = tender.rawJson;
    }

    const publicationNumber =
      dto.publicationNumber ?? tender.publicationNumber ?? tender.id;

    return this.ensureTedIdentity(dto, publicationNumber);
  }

  private isTedPublicationNumber(value: string): boolean {
    return /^\d{5,8}-\d{4}$/.test(value);
  }

  private withoutRaw(dto: TenderDto): TenderDto {
    const rest = { ...dto };
    delete rest.raw;

    return rest;
  }

  private valueToString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isTedNotice(value: unknown): value is TedNotice {
    return this.isRecord(value);
  }
}
