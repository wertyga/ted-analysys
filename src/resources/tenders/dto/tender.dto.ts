import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenderGeneralAnalysisDetailDto } from '../../tender-analysis/dto/tender-general-analysis.dto';

export class TenderCpvDto {
  @ApiProperty({ example: '72000000' })
  code!: string;

  @ApiPropertyOptional({
    example:
      'IT services: consulting, software development, Internet and support',
  })
  name?: string;

  @ApiPropertyOptional({ example: '72000000' })
  parentCode?: string;

  @ApiPropertyOptional({ example: 2 })
  level?: number;
}

export class TenderDto {
  @ApiProperty({ example: '756265-2023' })
  id!: string;

  @ApiProperty({ example: 'TED' })
  source!: 'TED';

  @ApiPropertyOptional({ example: '756265-2023' })
  sourceNoticeId?: string;

  @ApiPropertyOptional({ example: '756265-2023' })
  publicationNumber?: string;

  @ApiPropertyOptional({ example: 'cn-standard' })
  noticeType?: string;

  @ApiPropertyOptional({ example: 'restricted' })
  procedureType?: string;

  @ApiPropertyOptional({ example: 'Software development services' })
  title?: string;

  @ApiPropertyOptional({ example: 'City of Helsinki' })
  buyerName?: string;

  @ApiPropertyOptional({ example: 'FIN' })
  buyerCountry?: string;

  @ApiPropertyOptional({ example: '2023-12-13Z' })
  publicationDate?: string;

  @ApiPropertyOptional({ example: '2029-12-17T12:00:00+02:00' })
  submissionDeadline?: string;

  @ApiPropertyOptional({ example: 'services' })
  contractNature?: string;

  @ApiPropertyOptional({ type: [TenderCpvDto] })
  classificationCpv?: TenderCpvDto[];

  @ApiPropertyOptional()
  cpvCodes?: string[];

  @ApiPropertyOptional({ type: Object })
  links?: unknown;

  @ApiPropertyOptional({ type: Object })
  generalAnalysis?: TenderGeneralAnalysisDetailDto | null;
}
