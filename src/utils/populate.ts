import { PopulateOptions } from 'mongoose';
import { CPV_CODES_LIST_FIELDS } from '@/resources/cpv/cpv.service';

export const companyCpvPopulateFields: PopulateOptions[] = [
  { path: 'industries', select: CPV_CODES_LIST_FIELDS },
  { path: 'mainServices', select: CPV_CODES_LIST_FIELDS },
];

export const tenderCpvPopulateFields: PopulateOptions[] = [
  { path: 'classificationCpv', select: CPV_CODES_LIST_FIELDS },
  { path: 'mainClassificationProc', select: CPV_CODES_LIST_FIELDS },
  { path: 'mainClassificationLot', select: CPV_CODES_LIST_FIELDS },
  { path: 'additionalClassificationLot', select: CPV_CODES_LIST_FIELDS },
];

export const deepAnalysisPopulateFields: PopulateOptions[] = [
  { path: 'generalAnalysis' },
  { path: 'tender', populate: tenderCpvPopulateFields },
  { path: 'company', populate: companyCpvPopulateFields },
];

export const companyFilterPopulateFields: PopulateOptions[] = [
  { path: 'user' },
];
