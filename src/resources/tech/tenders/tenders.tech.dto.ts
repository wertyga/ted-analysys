import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateTenderShortTitlesRequestDto {
  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  batchSize: number = 10;
}

export class GenerateTenderGeneralAnalysesRequestDto {
  @ApiPropertyOptional({
    description:
      'Maximum number of missing or stale general analyses to enqueue.',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 100;

  @ApiPropertyOptional({
    description: 'Number of tenders to inspect per database batch.',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  batchSize: number = 100;
}

export class FixTenderLotAwardCriteriaRequestDto {
  @ApiPropertyOptional({
    description: 'Number of tenders to read per MongoDB batch.',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  batchSize: number = 100;

  @ApiPropertyOptional({
    description: 'Only inspect these TED publication ids.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @ApiPropertyOptional({
    description: 'Return planned updates without writing to MongoDB.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  dryRun: boolean = false;
}
