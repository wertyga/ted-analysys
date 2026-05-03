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

export class TenderEstimatedValueDto {
  @ApiPropertyOptional({ example: 1250000 })
  amount!: number | null;

  @ApiPropertyOptional({ example: 'EUR' })
  currency!: string | null;
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

  @ApiPropertyOptional({ example: 'Software development and maintenance.' })
  description?: string;

  @ApiPropertyOptional({ type: TenderEstimatedValueDto })
  estimatedValue?: TenderEstimatedValueDto;

  @ApiPropertyOptional({ example: 'ENG' })
  noticeLanguage?: string;

  @ApiPropertyOptional({ type: [String], example: ['ENG', 'POL'] })
  submissionLanguages?: string[];

  @ApiPropertyOptional({ example: 'City of Helsinki' })
  buyerName?: string;

  @ApiPropertyOptional({ example: 'FIN' })
  buyerCountry?: string;

  @ApiPropertyOptional({ example: '2023-12-13Z' })
  publicationDate?: string;

  @ApiPropertyOptional({ example: '2029-12-17T12:00:00+02:00' })
  submissionDeadline?: string;

  @ApiPropertyOptional({ example: '2029-12-01T12:00:00+02:00' })
  questionsDeadline?: string;

  @ApiPropertyOptional({ example: '2029-12-20' })
  plannedStartDate?: string;

  @ApiPropertyOptional({ example: '2030-12-20' })
  plannedEndDate?: string;

  @ApiPropertyOptional({ example: 'services' })
  contractNature?: string;

  @ApiPropertyOptional({ example: false })
  isDps?: boolean;

  @ApiPropertyOptional({ example: true })
  isFrameworkAgreement?: boolean;

  @ApiPropertyOptional({ example: true })
  isSmeSuitable?: boolean;

  @ApiPropertyOptional({ example: 'required' })
  electronicSubmission?: string;

  @ApiPropertyOptional({
    example: 'https://ted.europa.eu/en/notice/-/detail/756265-2023',
  })
  documentUrl?: string;

  @ApiPropertyOptional({ type: [TenderCpvDto] })
  classificationCpv?: TenderCpvDto[];

  @ApiPropertyOptional()
  cpvCodes?: string[];

  @ApiPropertyOptional({ type: Object })
  links?: unknown;

  @ApiPropertyOptional({ type: Object })
  generalAnalysis?: TenderGeneralAnalysisDetailDto | null;
}
