import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TenderGeneralAnalysisStatus,
  TenderGeneralRecommendation,
} from '../schemas';

export class TenderGeneralAnalysisListDto {
  @ApiProperty({ enum: TenderGeneralAnalysisStatus })
  status!: TenderGeneralAnalysisStatus;

  @ApiPropertyOptional()
  summary?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  complexityScore?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  opportunityScore?: number;

  @ApiPropertyOptional({ enum: TenderGeneralRecommendation })
  generalRecommendation?: TenderGeneralRecommendation;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  confidenceScore?: number;

  @ApiPropertyOptional()
  analyzedAt?: Date;

  @ApiPropertyOptional()
  model?: string;

  @ApiPropertyOptional()
  promptVersion?: string;
}

export class TenderGeneralAnalysisDetailDto extends TenderGeneralAnalysisListDto {
  @ApiPropertyOptional({ type: Object })
  resultJson?: unknown;

  @ApiPropertyOptional()
  errorMessage?: string;
}
