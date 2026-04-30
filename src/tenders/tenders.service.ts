import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CpvService } from '../cpv/cpv.service';
import { TedSearchRequestDto } from '../ted-search/dto/ted-search-request.dto';
import {
  TedNotice,
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
} from '../ted-search/types/ted-search.types';
import { TedSearchService } from '../ted-search/ted-search.service';
import {
  CpvMatchMode,
  TenderSearchByCpvDto,
  TenderSearchDto,
} from './dto/tender-search.dto';
import { TenderDto, TenderSearchResponseDto } from './dto/tender.dto';
import { TenderModel } from './schemas/tender.schema';
import { TenderNormalizerService } from './tender-normalizer.service';

const TED_PUBLICATION_NUMBER_FIELD = 'publication-number';

@Injectable()
export class TendersService {
  private readonly logger = new Logger(TendersService.name);

  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tenderNormalizer: TenderNormalizerService,
    private readonly cpvService: CpvService,
  ) {}
  
  private async upsertTendersWithRaw(
    items: TenderDto[],
    rawNotices: TedNotice[],
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }
    
    await TenderModel.bulkWrite(
      items.map((item, index) => {
        const rawNotice = rawNotices[index];
        const publicationNumber =
          item.publicationNumber ?? this.extractTedPublicationNumber(item.id);
        
        const normalizedItem = this.normalizeTenderDtoId(
          item,
          publicationNumber,
        );
        
        return {
          updateOne: {
            filter: { id: normalizedItem.id },
            update: {
              $set: this.buildTenderPersistencePayload(
                normalizedItem,
                rawNotice,
              ),
            },
            upsert: true,
          },
        };
      }),
      { ordered: false },
    );
  }
  
  async search(dto: TenderSearchDto): Promise<TenderSearchResponseDto> {
    const payload = this.buildTedSearchPayload(dto);
    console.log('DTO FROM FRONT:', dto);
    console.log('TED PAYLOAD:', payload);
    
    this.logger.debug(`TED search query: ${payload.query}`);
    
    const rawResponse = await this.tedSearchService.searchNotices(payload);
    const notices = this.extractNotices(rawResponse);
    
    const items = await Promise.all(
      notices.map((notice) =>
        this.tenderNormalizer.normalize(notice, dto.includeRaw),
      ),
    );
    
    await this.upsertTendersWithRaw(items, notices);
    
    const totalCount =
      typeof rawResponse.totalNoticeCount === 'number'
        ? rawResponse.totalNoticeCount
        : typeof rawResponse.totalCount === 'number'
          ? rawResponse.totalCount
          : items.length;
    
    return {
      items,
      meta: {
        page: dto.page,
        limit: dto.limit,
        totalCount,
        hasNextPage: dto.page * dto.limit < totalCount,
      },
    };
  }
  
  async searchByCpv(
    dto: TenderSearchByCpvDto,
  ): Promise<TenderSearchResponseDto> {
    return this.search({
      cpvCodes: dto.cpvCodes,
      scope: dto.scope,
      page: dto.page,
      limit: dto.limit,
      includeRaw: dto.includeRaw,
      matchMode: dto.matchMode,
    });
  }

  async findById(id: string, includeRaw: boolean = false): Promise<TenderDto> {
    return this.findByIdOrFetchFromTed(id, { includeRaw });
  }

  async findByIdOrFetchFromTed(
    id: string,
    options: { includeRaw?: boolean } = {},
  ): Promise<TenderDto> {
    const localTender = await this.findLocalTender(id);

    if (localTender) {
      return this.mapTenderDocumentToDto(localTender, {
        includeRaw: options.includeRaw ?? false,
      });
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
    const normalizedDto = this.normalizeTenderDtoId(dto, publicationNumber);

    await this.upsertTender(normalizedDto, tedNotice);

    return normalizedDto;
  }

  private buildTedSearchPayload(dto: TenderSearchDto): TedSearchRequestDto {
    const query = this.buildExpertQuery(dto);

    return {
      query,
      scope: dto.scope,
      page: dto.page,
      limit: dto.limit,
      paginationMode: TedPaginationMode.PAGE_NUMBER,
      onlyLatestVersions: false,
      checkQuerySyntax: false,
      fields: [
        'publication-number',
        'notice-title',
        'publication-date',
        'deadline',
        'classification-cpv',
        'contract-nature',
        'buyer-name',
        'buyer-country',
        'notice-type',
      ],
    };
  }
  
  private buildCpvQuery(
    cpvCodes: string[],
    matchMode: CpvMatchMode = CpvMatchMode.TREE,
  ): string {
    const codes = this.normalizeCpvCodes(cpvCodes);
    
    if (matchMode === CpvMatchMode.EXACT) {
      return `classification-cpv IN (${codes.join(' ')})`;
    }
    
    const parts = codes.map((code) => {
      const prefix = code.replace(/0+$/, '');
      
      if (prefix.length >= 2 && prefix.length < 8) {
        return `${prefix}*`;
      }
      
      return code;
    });
    
    return `classification-cpv IN (${parts.join(' ')})`;
  }
  
  private buildExpertQuery(dto: TenderSearchDto): string {
    const parts: string[] = [];
    
    // Временно добавляем рабочий фильтр, чтобы TED точно возвращал services notices
    parts.push('contract-nature IN (services)');
    
    if (dto.cpvCodes !== undefined && dto.cpvCodes.length > 0) {
      parts.push(this.buildCpvQuery(dto.cpvCodes, dto.matchMode));
    }
    
    if (dto.countries !== undefined && dto.countries.length > 0) {
      parts.push(
        `place-of-performance IN (${this.normalizeCountryCodes(dto.countries).join(' ')})`,
      );
    }
    
    if (dto.keyword !== undefined && dto.keyword.trim().length > 0) {
      parts.push(`FT ~ (${this.normalizeKeyword(dto.keyword)})`);
    }
    
    return parts.length === 1 ? `(${parts[0]})` : `(${parts.join(' AND ')})`;
  }

  normalizeTenderId(id: string): string {
    const trimmed = id.trim();

    if (trimmed.startsWith('ted-')) {
      return trimmed;
    }

    if (/^\d{6}-\d{4}$/.test(trimmed)) {
      return `ted-${trimmed}`;
    }

    return trimmed;
  }

  extractTedPublicationNumber(id: string): string | null {
    const trimmed = id.trim();
    const prefixedMatch = trimmed.match(/^ted-(\d{6}-\d{4})$/);

    if (prefixedMatch) {
      return prefixedMatch[1];
    }

    if (/^\d{6}-\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    const compactMatch = trimmed.match(/^(\d{6})(\d{4})$/);

    if (compactMatch) {
      return `${compactMatch[1]}-${compactMatch[2]}`;
    }

    return null;
  }

  isLikelyTedPublicationNumber(id: string): boolean {
    return this.extractTedPublicationNumber(id) !== null;
  }

  async fetchTedNoticeByPublicationNumber(
    publicationNumber: string,
  ): Promise<TedNotice | null> {
    // TODO: Verify the exact TED expert-search field name if TED changes
    // publication number search semantics.
    const query = `(${TED_PUBLICATION_NUMBER_FIELD} = "${publicationNumber}")`;

    try {
      const response = await this.tedSearchService.searchNotices({
        query,
        scope: TedScope.ALL,
        limit: 1,
        page: 1,
        paginationMode: TedPaginationMode.PAGE_NUMBER,
        onlyLatestVersions: true,
        checkQuerySyntax: true,
      });

      return this.extractNotices(response)[0] ?? null;
    } catch (error) {
      if (error instanceof BadRequestException) {
        this.logger.warn(
          `TED publication-number lookup query was rejected for ${publicationNumber}`,
        );

        return null;
      }

      throw error;
    }
  }

  private normalizeCpvCodes(codes: string[]): string[] {
    const normalized = Array.from(
      new Set(
        codes.map((code) => code.trim()).filter((code) => /^\d{8}$/.test(code)),
      ),
    );

    if (normalized.length === 0) {
      throw new BadRequestException('At least one valid CPV code is required');
    }

    return normalized;
  }

  private normalizeCountryCodes(countries: string[]): string[] {
    const normalized = Array.from(
      new Set(
        countries
          .map((country) =>
            country
              .trim()
              .replace(/[^A-Za-z0-9_-]/g, '')
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
    );

    if (normalized.length === 0) {
      throw new BadRequestException(
        'At least one valid country code is required',
      );
    }

    return normalized;
  }

  private normalizeKeyword(keyword: string): string {
    return keyword
      .trim()
      .split(/\s+/)
      .map((term) => term.replace(/[^\p{L}\p{N}_*-]/gu, ''))
      .filter(Boolean)
      .join(' ');
  }
  
  private extractNotices(response: TedSearchResponse | any): TedNotice[] {
    if (Array.isArray(response?.notices)) {
      return response.notices;
    }
    
    if (Array.isArray(response?.data?.notices)) {
      return response.data.notices;
    }
    
    if (Array.isArray(response?.results)) {
      return response.results.filter(
        (item): item is TedNotice =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      );
    }
    
    return [];
  }

  private async upsertTenders(items: TenderDto[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    await TenderModel.bulkWrite(
      items.map((item) => {
        const publicationNumber =
          item.publicationNumber ?? this.extractTedPublicationNumber(item.id);
        const normalizedItem = this.normalizeTenderDtoId(
          item,
          publicationNumber,
        );

        return {
          updateOne: {
            filter: { id: normalizedItem.id },
            update: {
              $set: this.buildTenderPersistencePayload(
                normalizedItem,
                item.raw,
              ),
            },
            upsert: true,
          },
        };
      }),
      { ordered: false },
    );
  }

  private async upsertTender(dto: TenderDto, raw: unknown): Promise<void> {
    await TenderModel.updateOne(
      { id: dto.id },
      { $set: this.buildTenderPersistencePayload(dto, raw) },
      { upsert: true },
    );
  }

  private async findLocalTender(id: string) {
    const normalizedId = this.normalizeTenderId(id);
    const publicationNumber = this.extractTedPublicationNumber(id);
    const idCandidates = Array.from(
      new Set(
        [
          id.trim(),
          normalizedId,
          publicationNumber,
          publicationNumber?.replace('-', ''),
        ].filter(
          (value): value is string => value !== undefined && value !== null,
        ),
      ),
    );

    return TenderModel.findOne({
      $or: [
        { id: { $in: idCandidates } },
        ...(publicationNumber
          ? [{ publicationNumber }, { sourceNoticeId: publicationNumber }]
          : []),
      ],
    }).lean();
  }

  private mapTenderDocumentToDto(
    tender: Record<string, any>,
    options: { includeRaw: boolean },
  ): TenderDto {
    const normalizedJson = tender.normalizedJson;
    const baseDto =
      this.isRecord(normalizedJson) && typeof normalizedJson.id === 'string'
        ? (normalizedJson as unknown as TenderDto)
        : ({
            id: tender.id,
            sourceNoticeId: tender.sourceNoticeId,
            publicationNumber: tender.publicationNumber,
            title: tender.title,
            description: tender.description,
            buyerName: tender.buyerName,
            buyerCountry: tender.buyerCountry,
            buyerCity: tender.buyerCity,
            publicationDate: tender.publicationDate,
            deadline: tender.deadline,
            cpvCodes: tender.cpvCodes ?? [],
            noticeType: tender.noticeType,
            procedureType: tender.procedureType,
            estimatedValue: tender.estimatedValue,
            lots: tender.lots ?? [],
            tedUrl: tender.tedUrl,
          } as TenderDto);
    const dto: TenderDto = { ...baseDto };

    delete dto.raw;

    if (options.includeRaw) {
      dto.raw = tender.rawJson ?? tender.raw;
    }

    return dto;
  }

  private normalizeTenderDtoId(
    dto: TenderDto,
    publicationNumber?: string | null,
  ): TenderDto {
    const detectedPublicationNumber =
      publicationNumber ??
      dto.publicationNumber ??
      this.extractTedPublicationNumber(dto.id);

    return {
      ...dto,
      id:
        detectedPublicationNumber !== null &&
        detectedPublicationNumber !== undefined
          ? this.normalizeTenderId(detectedPublicationNumber)
          : this.normalizeTenderId(dto.id),
      publicationNumber:
        dto.publicationNumber ?? detectedPublicationNumber ?? undefined,
    };
  }

  private buildTenderPersistencePayload(dto: TenderDto, raw: unknown) {
    const normalizedJson = { ...dto };
    delete normalizedJson.raw;

    return {
      ...normalizedJson,
      source: 'TED',
      raw: raw ?? dto.raw,
      rawJson: raw ?? dto.raw,
      normalizedJson,
      lastSeenAt: new Date(),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
