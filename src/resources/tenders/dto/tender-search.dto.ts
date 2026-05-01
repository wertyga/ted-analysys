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
import { TedScope } from '../../ted-search/types/ted-search.types';

export enum CpvMatchMode {
  TREE = 'TREE',
  EXACT = 'EXACT',
}

export class TenderSearchDto {
  @ApiPropertyOptional({
    type: [String],
    example: ['72000000'],
    description: 'CPV codes to filter by.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(/^\d{8}$/, { each: true })
  cpvCodes?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['POL'],
    description: 'TED place-of-performance country codes.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  @ApiPropertyOptional({ example: 'software', description: 'Full-text TED keyword query.' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: TedScope, example: TedScope.ACTIVE })
  @IsOptional()
  @IsEnum(TedScope)
  scope: TedScope = TedScope.ACTIVE;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeRaw: boolean = false;

  @ApiPropertyOptional({
    enum: CpvMatchMode,
    example: CpvMatchMode.TREE,
    description:
      'TREE expands CPV matching by prefix; EXACT searches only supplied CPV codes.',
  })
  @IsOptional()
  @IsEnum(CpvMatchMode)
  matchMode: CpvMatchMode = CpvMatchMode.TREE;
}

export class TenderSearchByCpvDto {
  @ApiPropertyOptional({
    enum: CpvMatchMode,
    example: CpvMatchMode.TREE,
    description:
      'TREE expands CPV matching by prefix; EXACT searches only supplied CPV codes.',
  })
  @IsOptional()
  @IsEnum(CpvMatchMode)
  matchMode: CpvMatchMode = CpvMatchMode.TREE;

  @ApiProperty({
    type: [String],
    example: ['72000000'],
    description: 'CPV codes to search for.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(/^\d{8}$/, { each: true })
  cpvCodes!: string[];

  @ApiPropertyOptional({ enum: TedScope, example: TedScope.ACTIVE })
  @IsOptional()
  @IsEnum(TedScope)
  scope: TedScope = TedScope.ACTIVE;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeRaw: boolean = false;
}
