import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TedNoticeType } from '../../tenders/types';
import { TedScope } from '../types/ted-search.types';
import {
  TED_ELIGIBLE_COUNTRY_CODES,
  TedEligibleCountryCode,
} from '../utils/ted-countries';

export enum TedContractNature {
  SERVICES = 'services',
  SUPPLIES = 'supplies',
  WORKS = 'works',
}

export enum TedDeadlineRange {
  ANY_OPEN = 'any-open',
  NEXT_7_DAYS = 'next-7-days',
  NEXT_14_DAYS = 'next-14-days',
  NEXT_30_DAYS = 'next-30-days',
  CUSTOM = 'custom',
}

export class TedTenderSearchRequestDto {
  @ApiPropertyOptional({ example: 'software development' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  text?: string;

  @ApiPropertyOptional({ example: 'software' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional({ example: 'cloud migration' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['72000000', '48000000'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  cpvCodes?: string[];

  @ApiPropertyOptional({
    enum: TED_ELIGIBLE_COUNTRY_CODES,
    isArray: true,
    example: ['POL', 'DEU'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Transform(({ value }) => normalizeCountryInput(value))
  @IsIn(TED_ELIGIBLE_COUNTRY_CODES, { each: true })
  buyerCountries?: TedEligibleCountryCode[];

  @ApiPropertyOptional({
    enum: TED_ELIGIBLE_COUNTRY_CODES,
    isArray: true,
    example: ['POL'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Transform(({ value }) => normalizeCountryInput(value))
  @IsIn(TED_ELIGIBLE_COUNTRY_CODES, { each: true })
  placeOfPerformance?: TedEligibleCountryCode[];

  @ApiPropertyOptional({
    enum: TedNoticeType,
    isArray: true,
    example: ['cn-standard', 'cn-social'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TedNoticeType, { each: true })
  noticeTypes?: TedNoticeType[];

  @ApiPropertyOptional({
    enum: TedContractNature,
    example: TedContractNature.SERVICES,
  })
  @IsOptional()
  @IsEnum(TedContractNature)
  contractNature?: TedContractNature;

  @ApiPropertyOptional({ example: '20260101', pattern: '^[0-9]{8}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/)
  publicationDateFrom?: string;

  @ApiPropertyOptional({ example: '20261231', pattern: '^[0-9]{8}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/)
  publicationDateTo?: string;

  @ApiPropertyOptional({
    enum: TedDeadlineRange,
    example: TedDeadlineRange.ANY_OPEN,
    description:
      'Predefined submission deadline range. CUSTOM uses submissionDeadlineFrom/submissionDeadlineTo.',
  })
  @IsOptional()
  @IsEnum(TedDeadlineRange)
  submissionDeadlineRange?: TedDeadlineRange = TedDeadlineRange.ANY_OPEN;

  @ApiPropertyOptional({ example: '20260101', pattern: '^[0-9]{8}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/)
  submissionDeadlineFrom?: string;

  @ApiPropertyOptional({ example: '20261231', pattern: '^[0-9]{8}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/)
  submissionDeadlineTo?: string;

  @ApiPropertyOptional({ enum: TedScope, example: TedScope.ACTIVE })
  @IsOptional()
  @IsEnum(TedScope)
  scope?: TedScope;

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

function normalizeCountryInput(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item: unknown) => {
    if (typeof item === 'string') {
      return item.trim().toUpperCase();
    }

    return item;
  });
}
