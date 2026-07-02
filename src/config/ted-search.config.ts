import { TedTenderSortColumn } from '@/resources/ted-search/types/ted-search.types';
import { BUYER_FIELDS } from '@/config/buyer.config';

export const FRAMEWORK_FIELDS = [
  'framework-estimated-value',
  'framework-estimated-value-cur',

  'framework-value-notice',
  'framework-value-cur-notice',

  'framework-approximate-value-notice',
  'framework-approximate-value-cur-notice',

  'result-framework-maximum-value-notice',
  'result-framework-maximum-value-cur-notice',

  'framework-maximum-value-lot',
  'framework-maximum-value-cur-lot',
  'framework-agreement-lot',
];

export const COMPETITION_FIELDS = [
  'identifier-lot',
  'internal-identifier-lot',
  'title-lot',
  'description-lot',
  'main-classification-lot',
  'additional-classification-lot',
  'contract-nature-main-lot',
  'estimated-value-lot',
  'estimated-value-cur-lot',

  'dps-usage-lot',

  'duration-period-value-lot',
  'duration-period-unit-lot',

  'deadline-receipt-tender-date-lot',
  'deadline-receipt-tender-time-lot',

  'document-url-lot',
  'submission-url-lot',
  'electronic-submission-lot',
  'submission-language',

  'place-of-performance-country-lot',
  'place-of-performance-subdiv-lot',
  'place-of-performance-city-lot',

  'award-criterion-type-lot',
  'award-criterion-name-lot',
  'award-criterion-description-lot',
  'award-criterion-number-lot',
  'award-criterion-number-weight-lot',

  'selection-criterion-name-lot',
  'selection-criterion-description-lot',
  'selection-criteria-source',
  'deadline-receipt-request',
];

export const SEARCH_DEFAULT_FIELDS = [
  'notice-identifier',
  'publication-number',
  'notice-type',
  'notice-subtype',
  'notice-version',
  'notice-title',
  'publication-date',
  'dispatch-date',
  'deadline',
  'deadline-receipt-answers-date-lot',
  'deadline-receipt-answers-time-lot',
  'title-proc',
  'description-proc',
  'procedure-type',
  'contract-nature',
  'legal-basis',
  'classification-cpv',
  'main-classification-proc',

  'estimated-value-proc',
  'estimated-value-cur-proc',
  'total-value',
  'total-value-cur',

  'place-of-performance-country-proc',
  'place-of-performance-city-proc',
  'links',
  'official-language',
  'contract-duration-start-date-lot',
  'contract-duration-end-date-lot',
  'sme-lot',
  'eu-fund-lot',
];

export const TED_SEARCH_CONFIG = {
  localSortFields: {
    [TedTenderSortColumn.PUBLICATION_DATE]: 'publicationDate',
    [TedTenderSortColumn.DEADLINE]: 'submissionDeadline',
    [TedTenderSortColumn.BUDGET]: 'estimatedValue.amount',
  },
  defaultLocalSortField: 'publicationDate',
};

export const TENDER_COMPETITION_SEARCH_FIELDS = Array.from(
  new Set([
    ...BUYER_FIELDS,
    ...COMPETITION_FIELDS,
    ...FRAMEWORK_FIELDS,
    ...SEARCH_DEFAULT_FIELDS,
  ]),
);
