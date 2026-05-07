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
  _id: string;

  @ApiProperty({
    example: '756265-2023',
    description:
      'Local canonical tender id. For TED tenders this is the publication number.',
  })
  id!: string;

  @ApiProperty({ example: 'TED', description: 'Source system name.' })
  source!: 'TED';

  @ApiPropertyOptional({
    example: 'abc123-2024',
    description:
      'TED/eForms notice-identifier: unique notice id in the source system.',
  })
  sourceNoticeId?: string;

  @ApiPropertyOptional({
    example: '756265-2023',
    description:
      'TED/OJ publication number. Useful for display and manual TED search.',
  })
  publicationNumber?: string;

  @ApiPropertyOptional({
    example: 'cn-standard',
    description:
      'TED notice-type: notice kind such as contract, award, or planning notice.',
  })
  noticeType?: string;

  @ApiPropertyOptional({
    example: '16',
    description:
      'TED notice-subtype: more specific eForms subtype inside the notice type.',
  })
  noticeSubtype?: string;

  @ApiPropertyOptional({
    example: '01',
    description:
      'TED notice-version: version of the notice, useful for detecting changes.',
  })
  noticeVersion?: string;

  @ApiPropertyOptional({
    example: 'restricted',
    description:
      'TED procedure-type: open, restricted, negotiated, and similar procedure kinds.',
  })
  procedureType?: string;

  @ApiPropertyOptional({
    example: 'Software development services',
    description:
      'Main display title, normally notice-title with procedure/lot title fallback.',
  })
  title?: string;

  @ApiPropertyOptional({
    example: 'Software development services',
    description: 'TED title-proc: title at procedure level.',
  })
  titleProc?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'TED title-lot: titles of individual lots.',
  })
  titleLot?: string[];

  @ApiPropertyOptional({
    example: 'Software development and maintenance.',
    description:
      'TED description-proc, with lot description fallback when procedure description is absent.',
  })
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'TED description-lot: descriptions of individual lots, useful for matching and AI analysis.',
  })
  descriptionLot?: string[];

  @ApiPropertyOptional({
    type: TenderEstimatedValueDto,
    description:
      'Estimated value selected from procedure value first, then lot value fallback.',
  })
  estimatedValue?: TenderEstimatedValueDto;

  @ApiPropertyOptional({
    example: 'ENG',
    description:
      'TED official-language: official notice/procedure/document language.',
  })
  noticeLanguage?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['ENG', 'POL'],
    description:
      'TED submission-language: languages allowed for tender submission.',
  })
  submissionLanguages?: string[];

  @ApiPropertyOptional({
    example: 'City of Helsinki',
    description: 'TED buyer-name: contracting buyer name.',
  })
  buyerName?: string;

  @ApiPropertyOptional({
    example: '1234567-8',
    description: 'TED buyer-identifier: buyer national or registry identifier.',
  })
  buyerIdentifier?: string;

  @ApiPropertyOptional({
    example: 'FIN',
    description:
      'TED buyer-country: country of the buyer, not necessarily place of performance.',
  })
  buyerCountry?: string;

  @ApiPropertyOptional({
    example: 'Helsinki',
    description: 'TED buyer-city: buyer city.',
  })
  buyerCity?: string;

  @ApiPropertyOptional({
    example: 'procurement@example.com',
    description: 'TED buyer-email: buyer contact email.',
  })
  buyerEmail?: string;

  @ApiPropertyOptional({
    example: 'https://example.com',
    description: 'TED buyer-internet-address: buyer website.',
  })
  buyerInternetAddress?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/buyer-profile',
    description: 'TED buyer-profile: buyer procurement profile URL.',
  })
  buyerProfile?: string;

  @ApiPropertyOptional({
    example: '2023-12-13Z',
    description:
      'TED publication-date: date when the notice was published on TED.',
  })
  publicationDate?: Date;

  @ApiPropertyOptional({
    example: '2023-12-12Z',
    description:
      'TED dispatch-date: date when the notice was dispatched for publication.',
  })
  dispatchDate?: Date;

  @ApiPropertyOptional({
    example: '2029-12-17T12:00:00+02:00',
    description:
      'Normalized submission deadline; uses lot tender deadline and falls back to TED deadline.',
  })
  submissionDeadline?: Date;

  @ApiPropertyOptional({
    example: '2029-12-17T12:00:00+02:00',
    description:
      'TED deadline-receipt-tender-*-lot combined as date/time when tenders/offers are due.',
  })
  deadlineReceiptTender?: Date;

  @ApiPropertyOptional({
    example: '2029-12-01T12:00:00+02:00',
    description:
      'TED deadline-receipt-answers-*-lot combined as buyer answers/clarifications deadline.',
  })
  questionsDeadline?: Date;

  @ApiPropertyOptional({
    example: '2029-12-20',
    description:
      'TED contract-duration-start-date-lot: earliest planned lot contract start date.',
  })
  plannedStartDate?: Date;

  @ApiPropertyOptional({
    example: '2030-12-20',
    description:
      'TED contract-duration-end-date-lot: latest planned lot contract end date.',
  })
  plannedEndDate?: Date;

  @ApiPropertyOptional({
    example: '12',
    description:
      'TED duration-period-value-lot: numeric contract duration value when provided.',
  })
  durationPeriodValue?: string;

  @ApiPropertyOptional({
    example: 'month',
    description:
      'TED duration-period-unit-lot: duration unit such as day, month, or year.',
  })
  durationPeriodUnit?: string;

  @ApiPropertyOptional({
    example: 'services',
    description: 'TED contract-nature: works, supplies, or services.',
  })
  contractNature?: string;

  @ApiPropertyOptional({
    example: '32014L0024',
    description:
      'TED legal-basis: legal act or directive/regulation basis for the procedure.',
  })
  legalBasis?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Derived from TED dps-usage-lot: whether Dynamic Purchasing System is used.',
  })
  isDps?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Derived from TED framework-agreement-lot: whether this is a framework agreement.',
  })
  isFrameworkAgreement?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Derived from TED sme-lot: SME suitability/relevance indicator when present.',
  })
  isSmeSuitable?: boolean;

  @ApiPropertyOptional({
    example: 'required',
    description:
      'TED electronic-submission-lot: electronic submission requirement/availability value.',
  })
  electronicSubmission?: string;

  @ApiPropertyOptional({
    type: [TenderCpvDto],
    description:
      'CpvCategory documents resolved from TED main-classification-proc.',
  })
  mainClassificationProc?: TenderCpvDto[];

  @ApiPropertyOptional({
    type: [TenderCpvDto],
    description:
      'CpvCategory documents resolved from TED main-classification-lot.',
  })
  mainClassificationLot?: TenderCpvDto[];

  @ApiPropertyOptional({
    type: [TenderCpvDto],
    description:
      'CpvCategory documents resolved from TED additional-classification-lot.',
  })
  additionalClassificationLot?: TenderCpvDto[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'TED place-of-performance-country-* fields: countries where the contract is performed.',
  })
  placeOfPerformanceCountries?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'TED place-of-performance-city-* fields: cities where the contract is performed.',
  })
  placeOfPerformanceCities?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'TED identifier-lot: technical lot ids inside the notice, e.g. LOT-0001.',
  })
  lotIdentifiers?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'TED internal-identifier-lot: stable lot references across notices/stages.',
  })
  internalLotIdentifiers?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'TED document-url-lot: procurement document URLs.',
  })
  documentUrls?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'TED submission-url-lot: URLs where tenders/submissions are filed.',
  })
  submissionUrls?: string[];

  @ApiPropertyOptional({
    example: true,
    description:
      'Derived from TED eu-fund-lot: whether EU funds/financing are indicated.',
  })
  euFundLot?: boolean;

  @ApiPropertyOptional({
    type: [Object],
    description:
      'TED selection-criterion-*-lot: lot-level selection criteria names/descriptions.',
  })
  selectionCriteria?: unknown[];

  @ApiPropertyOptional({
    type: [Object],
    description:
      'TED award-criterion-*-lot: lot-level award criteria names/descriptions/types/weights.',
  })
  awardCriteria?: unknown[];

  @ApiPropertyOptional({
    type: [TenderCpvDto],
    description:
      'Mongo ObjectId references populated from CpvCategory documents resolved from cpvCodes.',
  })
  classificationCpv?: TenderCpvDto[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Aggregated raw CPV code strings from classification/main/additional CPV fields.',
  })
  cpvCodes?: string[];

  @ApiPropertyOptional({
    type: Object,
    description:
      'Raw TED links object, including notice/XML/HTML/document links when returned.',
  })
  links?: unknown;

  @ApiPropertyOptional({
    type: Object,
    description: 'Generated tender analysis, when available.',
  })
  generalAnalysis?: TenderGeneralAnalysisDetailDto | null;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the tender is in the current user wishlist.',
  })
  isInWishlist?: boolean;
}
