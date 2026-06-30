import { BUYER_FIELDS } from '@/config/buyer.config';

export const AWARD_TENDER_CONFIG = {
  historyYearsBack: 3,
  awardTenderSearchLimit: 1,
  awardSearchCacheTtlMs: 7 * 24 * 60 * 60 * 1000,
};

export const AWARD_TENDER_FIELDS = [
  'publication-number',
  'notice-type',
  'notice-subtype',
  'notice-version',
  'notice-title',
  'publication-date',
  'dispatch-date',
  'deadline',

  'title-proc',
  'description-proc',
  'procedure-type',
  'contract-nature',
  'contract-nature-main-proc',

  'classification-cpv',
  'main-classification-proc',

  'place-of-performance-country-proc',
  'place-of-performance-city-proc',

  'main-activity',
  'authority-main-activity',
  'entity-main-activity',

  'estimated-value-proc',
  'estimated-value-cur-proc',
  'result-value-notice',
  'result-value-cur-notice',
  'result-value-lot',
  'result-value-cur-lot',
  'total-value',
  'total-value-cur',
  'tender-value-lowest',
  'tender-value-cur-lowest',
  'tender-value-highest',
  'tender-value-cur-highest',

  'received-submissions-type-code',
  'received-submissions-type-val',

  'links',
  'contract-url',
  'announcement-url',

  'result-framework-maximum-value-cur-notice',
  'result-framework-maximum-value-notice',

  'submission-language',

  'selection-criteria-source',
] as any;

export const WINNER_FIELDS = [
  'winner-name',
  'winner-identifier',
  'winner-country',
  'winner-country-sub',
  'winner-city',
  'winner-post-code',
  'winner-size',
  'winner-listed',
  'winner-selection-status',
  'winner-decision-date',
  'winner-internet-address',
  'winner-email',
  'winner-owner-nationality',
  'eu-registration-number',

  'contract-conclusion-date',
];

export const FRAMEWORK_FIELDS = [
  'framework-estimated-value',
  'framework-estimated-value-cur',

  'framework-value-notice',
  'framework-value-cur-notice',

  'framework-approximate-value-notice',
  'framework-approximate-value-cur-notice',

  'result-framework-maximum-value-notice',
  'result-framework-maximum-value-cur-notice',
];

export const AWARD_TENDER_LOT_FIELDS = [
  'identifier-lot',
  'internal-identifier-lot',
  'result-lot-identifier',
  'tender-lot-identifier',
  'title-lot',
  'description-lot',

  'contract-nature-main-lot',

  'estimated-value-lot',
  'estimated-value-cur-lot',

  'contract-duration-end-date-lot',
  'deadline-receipt-tender-date-lot',
  'deadline-receipt-tender-time-lot',

  'place-of-performance-country-lot',
  'place-of-performance-subdiv-lot',
  'place-of-performance-city-lot',

  'main-classification-lot',
  'additional-classification-lot',

  'duration-period-value-lot',
  'duration-period-unit-lot',

  'framework-agreement-lot',

  'dps-usage-lot',

  'document-url-lot',

  'submission-url-lot',
  'electronic-submission-lot',

  'award-criterion-type-lot',
  'award-criterion-description-lot',
  'award-criterion-number-lot',
  'award-criterion-number-weight-lot',

  'selection-criterion-name-lot',
  'selection-criterion-description-lot',
];

export const AWARD_HISTORY_FIELDS = Array.from(
  new Set([
    ...AWARD_TENDER_FIELDS,
    ...WINNER_FIELDS,
    ...BUYER_FIELDS,
    ...AWARD_TENDER_LOT_FIELDS,
    ...FRAMEWORK_FIELDS,
  ]),
);
