import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateTenderSitemapRequestDto {
  @IsString()
  @IsNotEmpty()
  domain!: string;

  @IsOptional()
  locales?: string | string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50_000)
  maxUrlsPerFile?: number;
}
