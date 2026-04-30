import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TenderCpvDto {
  @ApiProperty({ example: '72000000' })
  code!: string;

  @ApiPropertyOptional({ example: 'IT services: consulting, software development, Internet and support' })
  label?: string;

  @ApiPropertyOptional({ example: '72000000' })
  parentCode?: string;
}

export class TenderValueDto {
  @ApiPropertyOptional({ example: 100000 })
  amount?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  currency?: string;
}

export class TenderLotDto {
  @ApiPropertyOptional({ example: 'LOT-0001' })
  id?: string;

  @ApiPropertyOptional({ example: 'Software development services' })
  title?: string;

  @ApiPropertyOptional({ example: 'Development and maintenance of business software.' })
  description?: string;

  @ApiProperty({ type: [TenderCpvDto] })
  cpvCodes!: TenderCpvDto[];

  @ApiPropertyOptional({ type: TenderValueDto })
  estimatedValue?: TenderValueDto;
}

export class TenderDto {
  @ApiProperty({ example: '123456-2026' })
  id!: string;

  @ApiPropertyOptional({ example: 'abc-notice-id' })
  sourceNoticeId?: string;

  @ApiPropertyOptional({ example: '123456-2026' })
  publicationNumber?: string;

  @ApiPropertyOptional({ example: 'Software development services' })
  title?: string;

  @ApiPropertyOptional({ example: 'Tender for software development and maintenance.' })
  description?: string;

  @ApiPropertyOptional({ example: 'City of Warsaw' })
  buyerName?: string;

  @ApiPropertyOptional({ example: 'POL' })
  buyerCountry?: string;

  @ApiPropertyOptional({ example: 'Warsaw' })
  buyerCity?: string;

  @ApiPropertyOptional({ example: '20260430' })
  publicationDate?: string;

  @ApiPropertyOptional({ example: '20260530' })
  deadline?: string;

  @ApiProperty({ type: [TenderCpvDto] })
  cpvCodes!: TenderCpvDto[];

  @ApiPropertyOptional({ example: 'cn-standard' })
  noticeType?: string;

  @ApiPropertyOptional({ example: 'open' })
  procedureType?: string;

  @ApiPropertyOptional({ type: TenderValueDto })
  estimatedValue?: TenderValueDto;

  @ApiProperty({ type: [TenderLotDto] })
  lots!: TenderLotDto[];

  @ApiPropertyOptional({ example: 'https://ted.europa.eu/en/notice/-/detail/123456-2026' })
  tedUrl?: string;

  @ApiPropertyOptional({ description: 'Raw TED notice, only returned when includeRaw=true' })
  raw?: unknown;
}

export class TenderSearchMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 120 })
  totalCount!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;
}

export class TenderSearchResponseDto {
  @ApiProperty({ type: [TenderDto] })
  items!: TenderDto[];

  @ApiProperty({ type: TenderSearchMetaDto })
  meta!: TenderSearchMetaDto;
}
