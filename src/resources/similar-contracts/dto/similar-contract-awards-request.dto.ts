import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsEnum,
  IsIn,
  IsInt,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { TedContractNature } from '@/resources/ted-search/dto/ted-tender-search-request.dto';
import {
  TED_ELIGIBLE_COUNTRY_CODES,
  type TedEligibleCountryCode,
} from '@/resources/codelist';

export class SimilarContractAwardsRequestDto {
  @ApiProperty({
    type: [String],
    example: ['72000000', '48000000'],
    description:
      'CPV codes or CPV divisions. The search is normalized to CPV divisions.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  cpvCodes: string[];

  @ApiPropertyOptional({
    enum: TED_ELIGIBLE_COUNTRY_CODES,
    example: 'POL',
    description: 'Optional buyer country filter.',
  })
  @IsOptional()
  @IsIn(TED_ELIGIBLE_COUNTRY_CODES)
  buyerCountries?: TedEligibleCountryCode[];

  @ApiProperty({ enum: TedContractNature, example: TedContractNature.SERVICES })
  @ArrayNotEmpty()
  @IsEnum(TedContractNature)
  contractNature: TedContractNature[];

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
