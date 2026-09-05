import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  XPostFormat,
  XPostPillar,
  XPostStatus,
} from '../schemas/x-post.schema';

export class GenerateXPostDto {
  @ApiPropertyOptional({
    example: 'A EUR 2M hospital equipment tender in Norway closing in 10 days',
    description:
      'Leave empty to let the AI pick the subject itself (a fresh open tender, an interesting data trend, a notable award, or a not-recently-covered educational topic, depending on the pillar).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  topic?: string;

  @ApiProperty({ enum: XPostPillar })
  @IsEnum(XPostPillar)
  pillar: XPostPillar;

  @ApiPropertyOptional({ enum: XPostFormat, default: XPostFormat.Single })
  @IsOptional()
  @IsEnum(XPostFormat)
  format?: XPostFormat;

  @ApiPropertyOptional({ example: 'confident, dry humor' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tone?: string;

  @ApiPropertyOptional({ example: 'Mention it is a hospital, not a clinic' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateXPostDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  posts?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ enum: XPostStatus })
  @IsOptional()
  @IsEnum(XPostStatus)
  status?: XPostStatus;

  @ApiPropertyOptional({ enum: XPostPillar })
  @IsOptional()
  @IsEnum(XPostPillar)
  pillar?: XPostPillar;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class GetXPostsRequestDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number(value))
  limit?: number = 20;

  @ApiPropertyOptional({ enum: XPostStatus })
  @IsOptional()
  @IsEnum(XPostStatus)
  status?: XPostStatus;

  @ApiPropertyOptional({ enum: XPostPillar })
  @IsOptional()
  @IsEnum(XPostPillar)
  pillar?: XPostPillar;
}
