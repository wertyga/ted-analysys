import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  TedPaginationMode,
  TedScope,
  TedSortOrder,
} from '../types/ted-search.types';

export class TedSearchRequestDto {
  @ApiProperty({ example: 'classification-cpv IN (72000000)' })
  @IsString()
  query!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['publication-number', 'notice-title', 'buyer-name'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fields?: string[];

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: TedScope, example: TedScope.ACTIVE })
  @IsOptional()
  @IsEnum(TedScope)
  scope: TedScope = TedScope.ACTIVE;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  checkQuerySyntax: boolean = true;

  @ApiPropertyOptional({
    enum: TedPaginationMode,
    example: TedPaginationMode.PAGE_NUMBER,
  })
  @IsOptional()
  @IsEnum(TedPaginationMode)
  paginationMode: TedPaginationMode = TedPaginationMode.PAGE_NUMBER;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyLatestVersions: boolean = true;

  @ApiPropertyOptional({
    description:
      'Opaque token returned by TED Search API for ITERATION pagination.',
  })
  @IsOptional()
  @IsString()
  iterationNextToken?: string;

  @ApiPropertyOptional({ example: 'publication-date' })
  @IsOptional()
  @IsString()
  sortColumn?: string;

  @ApiPropertyOptional({ enum: TedSortOrder, example: TedSortOrder.DESC })
  @IsOptional()
  @IsEnum(TedSortOrder)
  sortOrder?: TedSortOrder;
}
