import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsDateString,
  IsOptional,
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

function normalizeCountryInput(value: unknown): unknown {
  const items = Array.isArray(value) ? value : [value];

  return items.map((item) =>
    typeof item === 'string' ? item.trim().toUpperCase() : item,
  );
}

export class AwardTenderPureSearchRequestDto {
  @ApiPropertyOptional({ type: [String], example: ['72000000', '48000000'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  cpvCodes?: string[];

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
    example: '2025-09-30',
    description: 'Only awards with awardDate on or after this date.',
  })
  @IsOptional()
  @IsDateString()
  awardDateFrom?: string;

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
