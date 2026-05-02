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
import { Tender, TenderModel } from './schemas';
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

      return dto;
    }

    const publicationNumber = this.extractTedPublicationNumber(id);

    if (publicationNumber === null) {
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

  normalizeTenderId(id: string): string {
    const trimmed = id.trim();

    if (trimmed.startsWith('ted-')) {
      return trimmed;
    }

    if (/^\d{6,8}-\d{4}$/.test(trimmed)) {
      return `ted-${trimmed}`;
    }

    if (/^\d{10,12}$/.test(trimmed)) {
      const publicationId = trimmed.slice(0, -4);
      const year = trimmed.slice(-4);

      return `ted-${publicationId}-${year}`;
    }

    return trimmed;
  }

  extractTedPublicationNumber(id: string): string | null {
    const trimmed = id.trim();
    const withoutPrefix = trimmed.startsWith('ted-')
      ? trimmed.slice('ted-'.length)
      : trimmed;

    if (/^\d{6,8}-\d{4}$/.test(withoutPrefix)) {
      return withoutPrefix;
    }

    if (/^\d{10,12}$/.test(withoutPrefix)) {
      const publicationId = withoutPrefix.slice(0, -4);
      const year = withoutPrefix.slice(-4);

      return `${publicationId}-${year}`;
    }

    return null;
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
      id: `ted-${publicationNumber}`,
      source: 'TED',
      sourceNoticeId: dto.sourceNoticeId ?? publicationNumber,
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
    const normalizedId = this.normalizeTenderId(id);
    const publicationNumber = this.extractTedPublicationNumber(id);
    const compactPublicationNumber = publicationNumber?.replace('-', '');
    const candidates = Array.from(
      new Set(
        [
          id.trim(),
          normalizedId,
          publicationNumber,
          compactPublicationNumber,
        ].filter(
          (value): value is string => value !== undefined && value !== null,
        ),
      ),
    );

    const or = [
      { id: { $in: candidates } },
      ...(publicationNumber
        ? [{ publicationNumber }, { sourceNoticeId: publicationNumber }]
        : []),
    ];

    return TenderModel.findOne({ $or: or }).lean<TenderRecord>().exec();
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
      dto.publicationNumber ??
      tender.publicationNumber ??
      this.extractTedPublicationNumber(tender.id) ??
      tender.id.replace(/^ted-/, '');

    return this.ensureTedIdentity(dto, publicationNumber);
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
