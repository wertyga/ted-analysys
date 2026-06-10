import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GenerateTenderSitemapRequestDto {
  @IsString()
  @IsNotEmpty()
  domain!: string;

  @IsOptional()
  locales?: string | string[];
}
