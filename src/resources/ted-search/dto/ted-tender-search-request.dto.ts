import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
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

export enum TedContractNature {
  SERVICES = 'services',
  SUPPLIES = 'supplies',
  WORKS = 'works',
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

  @ApiPropertyOptional({ type: [String], example: ['POL', 'DEU'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  buyerCountries?: string[];

  @ApiPropertyOptional({ type: [String], example: ['POL'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  placeOfPerformance?: string[];

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

  @ApiPropertyOptional({ example: '20260101', pattern: '^[0-9]{8}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/)
  deadlineFrom?: string;

  @ApiPropertyOptional({ example: '20261231', pattern: '^[0-9]{8}$' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8}$/)
  deadlineTo?: string;

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
