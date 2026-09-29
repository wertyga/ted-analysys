import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export enum ContractorListSortBy {
  TOTAL_AWARD_AMOUNT_EUR = 'stats.totalAwardAmountEur',
  AWARD_TENDERS_COUNT = 'stats.awardTendersCount',
  AWARD_LOTS_COUNT = 'stats.awardLotsCount',
  LAST_AWARD_WIN_DATE = 'stats.lastAwardWinDate',
}

export enum ContractorListSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ContractorListRequestDto {
  @ApiProperty({ example: 'software' })
  @IsString()
  @IsOptional()
  q: string;

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
    example: ['POL', 'DEU'],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  @ApiPropertyOptional({
    enum: ContractorListSortBy,
    default: ContractorListSortBy.TOTAL_AWARD_AMOUNT_EUR,
  })
  @IsOptional()
  @IsEnum(ContractorListSortBy)
  sortBy?: ContractorListSortBy;

  @ApiPropertyOptional({
    enum: ContractorListSortOrder,
    default: ContractorListSortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(ContractorListSortOrder)
  sortOrder?: ContractorListSortOrder;

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
