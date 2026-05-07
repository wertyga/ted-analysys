import { CPV_CODES_LIST_FIELDS } from '@/resources/cpv/cpv.service';

export const tenderCpvPopulateFields = [
  { path: 'classificationCpv', select: CPV_CODES_LIST_FIELDS },
  { path: 'mainClassificationProc', select: CPV_CODES_LIST_FIELDS },
  { path: 'mainClassificationLot', select: CPV_CODES_LIST_FIELDS },
  { path: 'additionalClassificationLot', select: CPV_CODES_LIST_FIELDS },
];
