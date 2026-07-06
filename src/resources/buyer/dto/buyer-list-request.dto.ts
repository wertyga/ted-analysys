import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const toStringArray = ({ value }: { value: unknown }) => {
  if (value === undefined) {
    return undefined;
  }

  return Array.isArray(value) ? value : [value];
};

export enum BuyerListSortBy {
  TOTAL_AWARDED_VALUE_EUR = 'stats.totalAwardedValueEur',
  TOTAL_ESTIMATED_VALUE_EUR = 'stats.totalEstimatedValueEur',
  TENDERS_COUNT = 'stats.tendersCount',
  AWARD_TENDERS_COUNT = 'stats.awardTendersCount',
}

export enum BuyerListSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class BuyerListRequestDto {
  @ApiPropertyOptional({
    description:
      'Text search by buyer name, identifier, email, city, or country.',
    example: 'hospital',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['POL', 'DEU'],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['72000000', '48000000'],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  cpvCodes?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['body-pl', 'la'],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  legalTypes?: string[];

  @ApiPropertyOptional({
    enum: BuyerListSortBy,
    example: BuyerListSortBy.TOTAL_AWARDED_VALUE_EUR,
  })
  @IsOptional()
  @IsEnum(BuyerListSortBy)
  sortBy?: BuyerListSortBy;

  @ApiPropertyOptional({
    enum: BuyerListSortOrder,
    example: BuyerListSortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(BuyerListSortOrder)
  sortOrder?: BuyerListSortOrder = BuyerListSortOrder.DESC;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AwardTenderBuyerRequestDto {
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
