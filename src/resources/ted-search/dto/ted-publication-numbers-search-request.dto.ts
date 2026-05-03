import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TedScope } from '../types/ted-search.types';

export class TedPublicationNumbersSearchRequestDto {
  @ApiProperty({
    type: [String],
    example: ['58725-2024', '756265-2023'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(/^\d{5,8}-\d{4}$/, { each: true })
  publicationNumbers!: string[];

  @ApiPropertyOptional({ enum: TedScope, example: TedScope.ALL })
  @IsOptional()
  @IsEnum(TedScope)
  scope?: TedScope;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 100, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}
