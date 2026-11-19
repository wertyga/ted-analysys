import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { normalizeSourcesInput } from './award-tender-list-request.dto';
import {
  TENDER_SOURCE_FILTER_VALUES,
  type TenderSourceFilter,
} from '@/resources/ted-search/ted.search.sources';

export class AwardTenderAwardsRequestDto {
  @ApiProperty({ example: '12345678-2026' })
  @IsString()
  @IsNotEmpty()
  tenderId: string;

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
