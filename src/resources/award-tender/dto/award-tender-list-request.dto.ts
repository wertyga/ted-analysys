import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  TedContractNature,
  TedProcedureType,
} from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import {
  TED_ELIGIBLE_COUNTRY_CODES,
  type TedEligibleCountryCode,
} from '@/resources/codelist';
import {
  TENDER_SOURCE_FILTER_VALUES,
  type TenderSourceFilter,
} from '@/resources/ted-search/ted.search.sources';

export enum AwardTenderSortBy {
  AWARD_DATE = 'awardDate',
  VALUE = 'value',
}

export enum AwardTenderSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

function toStringArray(value: unknown): unknown {
  const items = Array.isArray(value) ? value : [value];

  return items
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '');
}

export function normalizeSourcesInput(value: unknown): unknown {
  return (toStringArray(value) as unknown[]).map((item) =>
    typeof item === 'string' ? item.toUpperCase() : item,
  );
}

function normalizeCountryInput(value: unknown): unknown {
  return (toStringArray(value) as unknown[]).map((item) =>
    typeof item === 'string' ? item.toUpperCase() : item,
  );
}

export class AwardTenderFiltersRequestDto {
  @ApiPropertyOptional({ example: 'software' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    enum: TED_ELIGIBLE_COUNTRY_CODES,
    isArray: true,
    example: ['POL'],
  })
  @IsOptional()
  @Transform(({ value }) => normalizeCountryInput(value))
  @IsArray()
  @IsIn(TED_ELIGIBLE_COUNTRY_CODES, { each: true })
  countries?: TedEligibleCountryCode[];

  @ApiPropertyOptional({ type: [String], example: ['72000000'] })
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  cpvCodes?: string[];

  @ApiPropertyOptional({
    enum: TedContractNature,
    isArray: true,
    example: [TedContractNature.SERVICES],
  })
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(TedContractNature, { each: true })
  contractNature?: TedContractNature[];

  @ApiPropertyOptional({
    enum: TedProcedureType,
    isArray: true,
    example: [TedProcedureType.OPEN],
  })
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(TedProcedureType, { each: true })
  procedureType?: TedProcedureType[];

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  awardDateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  awardDateTo?: string;

  @ApiPropertyOptional({ example: 100000, description: 'EUR' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valueMin?: number;

  @ApiPropertyOptional({ example: 5000000, description: 'EUR' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valueMax?: number;

  @ApiPropertyOptional({ description: 'Contractor id' })
  @IsOptional()
  @IsMongoId()
  winnerId?: string;

  @ApiPropertyOptional({ description: 'Buyer id' })
  @IsOptional()
  @IsMongoId()
  buyerId?: string;

  @ApiPropertyOptional({
    enum: TENDER_SOURCE_FILTER_VALUES,
    isArray: true,
    example: ['TED', 'PL_BZP'],
    description: 'Award sources: TED and/or national sources. Empty = all.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeSourcesInput(value))
  @IsArray()
  @IsIn(TENDER_SOURCE_FILTER_VALUES, { each: true })
  sources?: TenderSourceFilter[];
}

export class AwardTenderListRequestDto extends AwardTenderFiltersRequestDto {
  @ApiPropertyOptional({
    enum: AwardTenderSortBy,
    default: AwardTenderSortBy.AWARD_DATE,
  })
  @IsOptional()
  @IsEnum(AwardTenderSortBy)
  sortBy?: AwardTenderSortBy;

  @ApiPropertyOptional({
    enum: AwardTenderSortOrder,
    default: AwardTenderSortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(AwardTenderSortOrder)
  sortOrder?: AwardTenderSortOrder;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
