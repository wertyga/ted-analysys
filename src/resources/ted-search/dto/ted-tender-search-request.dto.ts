import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  IsBoolean,
} from 'class-validator';
import { TedNoticeType } from '../../tenders/types';
import {
  TedScope,
  TedSortOrder,
  TedTenderSortColumn,
} from '../types/ted-search.types';
import {
  BuyerMainActivity,
  CurrencySign,
  TED_ELIGIBLE_COUNTRIES,
  TED_ELIGIBLE_COUNTRY_CODES,
  type TedEligibleCountryCode,
} from '@/resources/codelist';
import type { TedTenderSearchFilters } from '@/resources/ted-search/ted-builders';

export enum TedContractNature {
  SERVICES = 'services',
  SUPPLIES = 'supplies',
  WORKS = 'works',
}

export enum TedProcedureType {
  COMPETITIVE_DIALOGUE = 'comp-dial',
  COMPETITIVE_TENDERING = 'comp-tend',
  CONCESSION_AWARD_PROCEDURE = 'E',
  CONCESSION_AWARD_WITHOUT_PRIOR_NOTICE = 'F',
  CONTRACT_AWARD_WITHOUT_PRIOR_PUBLICATION = 'V',
  DIRECT_AWARD = 'A',
  INNOVATION_PARTNERSHIP = 'innovation',
  NEGOTIATED_PROCEDURE = '4_6',
  NEGOTIATED_WITH_CALL = 'neg-w-call',
  NEGOTIATED_WITHOUT_CALL = 'neg-wo-call',
  OPEN = 'open',
  OTHER = '8_9_Z',
  OTHER_MULTIPLE_STAGE = 'oth-mult',
  OTHER_SINGLE_STAGE = 'oth-single',
  EXPRESSION_INTEREST_RAIL = 'exp-int-rail',
  RESTRICTED = 'restricted',
}

export enum TedDeadlineRange {
  ANY_OPEN = 'any-open',
  NEXT_7_DAYS = 'next-7-days',
  NEXT_14_DAYS = 'next-14-days',
  NEXT_30_DAYS = 'next-30-days',
  CUSTOM = 'custom',
}

export class TedTenderSearchRequestDto implements TedTenderSearchFilters {
  @IsOptional()
  @IsBoolean()
  @IsNotEmpty()
  withoutBaseAnalysis?: boolean;

  @ApiPropertyOptional({ example: 'software development' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  text?: string;

  @ApiPropertyOptional({ type: [String], example: ['72000000', '48000000'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  cpvCodes?: string[];

  @ApiPropertyOptional({ type: [String], example: ['47039-2025'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  publicationNumber?: string[];

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
  buyerCountries?: TedEligibleCountryCode[]; // ++

  @ApiPropertyOptional({ example: 'Warsaw City Hall' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  buyerName?: string; // ++

  @ApiPropertyOptional({ example: '12345' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  buyerIdentifier?: string; // ++

  @ApiPropertyOptional({ example: 'warsaw' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  buyerCity?: string; // ++

  @ApiPropertyOptional({
    enum: BuyerMainActivity,
    isArray: true,
    example: [BuyerMainActivity.EDUCATION],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(BuyerMainActivity, { each: true })
  buyerMainActivity?: BuyerMainActivity[]; // ++

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
  placeOfPerformance?: TedEligibleCountryCode[]; // ++

  @ApiPropertyOptional({
    isArray: true,
    example: ['ENG', 'POL'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Transform(({ value }) => normalizeStringCodeInput(value))
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  submissionLanguage?: string[]; // ++

  @ApiPropertyOptional({
    enum: TedNoticeType,
    isArray: true,
    example: ['cn-standard', 'cn-social'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TedNoticeType, { each: true })
  noticeTypes?: TedNoticeType[]; // ++

  @ApiPropertyOptional({
    enum: TedProcedureType,
    isArray: true,
    example: [TedProcedureType.OPEN, TedProcedureType.RESTRICTED],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TedProcedureType, { each: true })
  procedureType?: TedProcedureType[];

  @ApiPropertyOptional({
    enum: TedContractNature,
    isArray: true,
    example: [TedContractNature.SERVICES],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TedContractNature, { each: true })
  contractNature?: TedContractNature[];

  @ApiPropertyOptional({
    enum: CurrencySign,
    isArray: true,
    example: [CurrencySign.EUR],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Transform(({ value }) => normalizeCurrencyInput(value))
  @IsEnum(CurrencySign, { each: true })
  currency?: CurrencySign[]; // ++

  @ApiPropertyOptional({ example: '20260101', pattern: '^[0-9]{8}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/)
  publicationDateFrom?: string; // ++

  @ApiPropertyOptional({ example: '20261231', pattern: '^[0-9]{8}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/)
  publicationDateTo?: string; // ++

  @ApiPropertyOptional({
    enum: TedDeadlineRange,
    example: TedDeadlineRange.ANY_OPEN,
    description:
      'Predefined submission deadline range. CUSTOM uses submissionDeadlineFrom/submissionDeadlineTo.',
  })
  @IsOptional()
  @IsEnum(TedDeadlineRange)
  submissionDeadlineRange?: TedDeadlineRange = TedDeadlineRange.ANY_OPEN; // ++

  @ApiPropertyOptional({ example: '20260101', pattern: '^[0-9]{8}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/)
  submissionDeadlineFrom?: string; // ++

  @ApiPropertyOptional({ example: '20261231', pattern: '^[0-9]{8}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/)
  submissionDeadlineTo?: string; // ++

  @ApiPropertyOptional({ enum: TedScope, example: TedScope.ACTIVE })
  @IsOptional()
  @IsEnum(TedScope)
  scope?: TedScope; // ++

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number; // ++

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number; // ++

  @ApiPropertyOptional({
    enum: TedTenderSortColumn,
    example: TedTenderSortColumn.PUBLICATION_DATE,
  })
  @IsOptional()
  @IsEnum(TedTenderSortColumn)
  sortColumn?: TedTenderSortColumn = TedTenderSortColumn.PUBLICATION_DATE;

  @ApiPropertyOptional({ enum: TedSortOrder, example: TedSortOrder.DESC })
  @IsOptional()
  @IsEnum(TedSortOrder)
  sortOrder?: TedSortOrder = TedSortOrder.DESC; // ++

  @ApiPropertyOptional({ minimum: 0, example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contractAwardFrom?: number;

  @ApiPropertyOptional({ minimum: 0, example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contractAwardTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  tenderIds?: string[];
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

function normalizeCurrencyInput(value: unknown): unknown {
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

function normalizeStringCodeInput(value: unknown): unknown {
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
