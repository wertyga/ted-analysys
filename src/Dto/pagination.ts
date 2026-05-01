import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { SORT_TYPE, SORT_DIRECTION } from '@/types';

export class PaginationDto {
  @ApiProperty({ required: false, description: 'Offset' })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  offset: number = 0;

  @ApiProperty({ required: false, description: 'Limit' })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  limit: number = 12;
}

export class SortDto {
  @ApiProperty({ required: false, description: 'Sort type', enum: SORT_TYPE })
  @IsEnum(SORT_TYPE)
  @IsOptional()
  sortBy: SORT_TYPE = SORT_TYPE.CreatedAt;

  @ApiProperty({
    required: false,
    description: 'Sort direction',
    enum: SORT_DIRECTION,
  })
  @IsEnum(SORT_DIRECTION)
  @IsOptional()
  sortDirection: SORT_DIRECTION = SORT_DIRECTION.DESC;
}

export class PaginationAndSortDto extends SortDto {
  @ApiProperty({ required: false, description: 'Offset' })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number(value))
  offset: number = 0;

  @ApiProperty({ required: false, description: 'Limit' })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number(value))
  limit: number = 12;
}
