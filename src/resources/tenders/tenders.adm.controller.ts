import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiBearerAuth,
  ApiDefaultResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { AdminAccessGuard } from '@/guards';
import { GatherActiveTendersResult, TendersService } from './tenders.service';
import {
  TedPaginationMode,
  TedScope,
  TedSearchResponse,
} from '@/resources/ted-search/types/ted-search.types';
import { TenderModel } from '@/resources/tenders/schemas';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import {
  extractPublicationNumberFromNotice,
  getSafeErrorMessage,
  isRecord,
} from '@/utils';
import { MigrateTenderDateFieldsResult } from './tenders.service';

class GatherActiveTendersRequestDto {
  @IsOptional()
  @IsString()
  iterationNextToken?: string;
}

@ApiTags('Admin Tenders')
@ApiBearerAuth()
@Controller('/tenders/adm')
@UseGuards(AdminAccessGuard)
export class TendersAdmController {
  constructor(
    private readonly tendersService: TendersService,
    private readonly tedSearchService: TedSearchService,
  ) {}

  async getExistingTenderPublicationNumbers(): Promise<Set<string>> {
    const tenders = await TenderModel.find({})
      .select('id publicationNumber')
      .lean()
      .exec();

    return new Set(
      tenders.flatMap((tender) =>
        [tender.id, tender.publicationNumber].filter(
          (value): value is string => typeof value === 'string',
        ),
      ),
    );
  }

  @Post('/gather-active')
  @ApiOperation({
    summary: 'Gather all active TED notices and save them as tenders',
  })
  @ApiDefaultResponse({
    description: 'TED active notices import summary.',
  })
  @ApiBody({ type: GatherActiveTendersRequestDto, required: false })
  async gatherActiveTenders(
    @Body() body: GatherActiveTendersRequestDto = {},
  ): Promise<GatherActiveTendersResult> {
    const limit = 100;
    let iterationNextToken = body.iterationNextToken?.trim() || undefined;
    let totalCount: number | undefined;
    let pagesFetched = 0;
    let noticesFetched = 0;
    let tendersSkipped = 0;
    let tendersSaved = 0;
    const existingPublicationNumbers =
      await this.getExistingTenderPublicationNumbers();

    while (true) {
      try {
        const response = await this.tedSearchService.searchNotices({
          query: 'publication-number = *',
          scope: TedScope.ACTIVE,
          limit,
          page: 1,
          paginationMode: TedPaginationMode.ITERATION,
          onlyLatestVersions: true,
          checkQuerySyntax: false,
          iterationNextToken,
          fields: this.tendersService.tenderDefaultFields,
        });
        const notices = this.tendersService.extractNotices(response);

        iterationNextToken = this.extractIterationNextToken(response);
        totalCount ??= this.extractTotalCount(response);
        pagesFetched += 1;
        noticesFetched += notices.length;

        if (notices.length === 0) {
          break;
        }

        const newNotices = notices.filter((notice) => {
          const publicationNumber = extractPublicationNumberFromNotice(notice);

          return (
            publicationNumber &&
            !existingPublicationNumbers.has(publicationNumber)
          );
        });
        tendersSkipped += notices.length - newNotices.length;

        const savedTenders =
          await this.tendersService.upsertMultipleTenders(newNotices);
        tendersSaved += savedTenders.length;
        for (const tender of savedTenders) {
          existingPublicationNumbers.add(tender.id);

          if (tender.publicationNumber) {
            existingPublicationNumbers.add(tender.publicationNumber);
          }
        }

        if (!iterationNextToken) {
          break;
        }
      } catch (error) {
        const result = {
          completed: false,
          totalCount,
          pagesFetched,
          noticesFetched,
          tendersSkipped,
          tendersSaved,
          resumeIterationNextToken: iterationNextToken,
          errorMessage: getSafeErrorMessage(error),
        };

        return result;
      }
    }

    const result = {
      completed: true,
      totalCount,
      pagesFetched,
      noticesFetched,
      tendersSkipped,
      tendersSaved,
    };

    return result;
  }

  private extractTotalCount(response: TedSearchResponse): number | undefined {
    if (typeof response.totalCount === 'number') {
      return response.totalCount;
    }

    if (typeof response.totalNoticeCount === 'number') {
      return response.totalNoticeCount;
    }

    const data = response.data;

    if (isRecord(data) && typeof data.totalCount === 'number') {
      return data.totalCount;
    }

    if (isRecord(data) && typeof data.totalNoticeCount === 'number') {
      return data.totalNoticeCount;
    }

    return undefined;
  }

  private extractIterationNextToken(
    response: TedSearchResponse,
  ): string | undefined {
    if (
      typeof response.iterationNextToken === 'string' &&
      response.iterationNextToken.trim().length > 0
    ) {
      return response.iterationNextToken;
    }

    if (
      typeof response.nextPageToken === 'string' &&
      response.nextPageToken.trim().length > 0
    ) {
      return response.nextPageToken;
    }

    const data = response.data;

    if (
      isRecord(data) &&
      typeof data.iterationNextToken === 'string' &&
      data.iterationNextToken.trim().length > 0
    ) {
      return data.iterationNextToken;
    }

    if (
      isRecord(data) &&
      typeof data.nextPageToken === 'string' &&
      data.nextPageToken.trim().length > 0
    ) {
      return data.nextPageToken;
    }

    return undefined;
  }

  @Post('/migrate-date-fields')
  @ApiOperation({
    summary: 'Migrate existing tender date fields from strings to Date values',
  })
  @ApiDefaultResponse({
    description: 'Tender date fields migration summary.',
  })
  async migrateDateFields(): Promise<MigrateTenderDateFieldsResult> {
    const dateFields = [
      'publicationDate',
      'dispatchDate',
      'submissionDeadline',
      'deadlineReceiptTender', // 2023-06-01+03:00T09:15:00+03:00
      'questionsDeadline', // 2099-12-01T23:59:59.999999999+01:00T23:59:59.999999999+01:00
      'plannedStartDate', // 2028-10-15+03:00
      'plannedEndDate', // 2028-10-15+03:00
    ] as const;
    const tenders = await TenderModel.find({})
      .select(dateFields.join(' '))
      .lean()
      .exec();
    let updated = 0;
    let skipped = 0;

    for (const tender of tenders) {
      const $set: Record<string, Date> = {};

      for (const field of dateFields) {
        const value = tender[field] as unknown;

        if (typeof value !== 'string') {
          continue;
        }

        const date = this.parseTenderDate(value);

        if (date) {
          $set[field] = date;
        }
      }

      if (Object.keys($set).length === 0) {
        skipped += 1;
        continue;
      }

      await TenderModel.updateOne({ _id: tender._id }, { $set }).exec();
      updated += 1;
    }

    return {
      scanned: tenders.length,
      updated,
      skipped,
    };
  }

  private parseTenderDate(value: string): Date | undefined {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return undefined;
    }

    if (/^\d{8}$/.test(trimmed)) {
      return this.toValidDate(
        `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T00:00:00.000Z`,
      );
    }

    const normalized = this.normalizeTenderDateText(trimmed);

    if (normalized !== undefined) {
      return this.toValidDate(normalized);
    }

    return this.toValidDate(trimmed);
  }

  private normalizeTenderDateText(value: string): string | undefined {
    const match = value.match(
      /^(\d{4}-\d{2}-\d{2})(?:Z|[+-]\d{2}:\d{2})?(?:T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)(?:Z|[+-]\d{2}:\d{2})?)?/,
    );

    if (!match) {
      return undefined;
    }

    const date = match[1];
    const time = this.normalizeTenderTime(match[2]);

    if (time) {
      return `${date}T${time}`;
    }

    return `${date}T00:00:00.000Z`;
  }

  private normalizeTenderTime(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const [baseTime, fraction] = value.split('.');
    const seconds = baseTime.length === 5 ? `${baseTime}:00` : baseTime;
    const milliseconds = fraction ? fraction.slice(0, 3).padEnd(3, '0') : '000';

    return `${seconds}.${milliseconds}Z`;
  }

  private toValidDate(value: string): Date | undefined {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
