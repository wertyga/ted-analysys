const BASE_SEARCH_TENDERS_DEFAULT_FIELDS = [
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
  'buyer-name',
  'buyer-identifier',
  'buyer-country',
  'buyer-city',
  'main-activity',
  'buyer-email',
  'buyer-internet-address',
  'buyer-profile',
  'estimated-value-proc',
  'estimated-value-cur-proc',
  'place-of-performance-country-proc',
  'place-of-performance-city-proc',
  'links',
  'official-language',
  'contract-duration-start-date-lot',
  'contract-duration-end-date-lot',
  'sme-lot',
  'eu-fund-lot',
] as const;

export const TED_COMPETITION_LOT_FIELDS = [
  'identifier-lot',
  'internal-identifier-lot',

  'title-lot',
  'description-lot',

  'main-classification-lot',
  'additional-classification-lot',
  'contract-nature-main-lot',

  'estimated-value-lot',
  'estimated-value-cur-lot',
  'framework-maximum-value-lot',
  'framework-maximum-value-cur-lot',

  'framework-agreement-lot',
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
  'award-criterion-number-weight-lot',

  'selection-criterion-name-lot',
  'selection-criterion-description-lot',
  'selection-criteria-source',
] as const;

export const searchTendersDefaultFields = Array.from(
  new Set([
    ...BASE_SEARCH_TENDERS_DEFAULT_FIELDS,
    ...TED_COMPETITION_LOT_FIELDS,
  ]),
);
