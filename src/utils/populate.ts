import { PopulateOptions } from 'mongoose';
import { CPV_CODES_LIST_FIELDS } from '@/resources/cpv/cpv.service';

export const companyCpvPopulateFields: PopulateOptions[] = [
  { path: 'industries', select: CPV_CODES_LIST_FIELDS },
  { path: 'mainServices', select: CPV_CODES_LIST_FIELDS },
];

export const tenderPopulateFields: PopulateOptions[] = [
  { path: 'nonLeadBuyers' },
  { path: 'leadBuyers' },
];

export const awardTenderPopulateFields: PopulateOptions[] = [
  { path: 'nonLeadBuyers' },
  { path: 'leadBuyers' },
  { path: 'winners' },
  { path: 'lots.winner', select: 'name identifiers' },
];

export const deepAnalysisPopulateFields: PopulateOptions[] = [
  { path: 'generalAnalysis' },
  { path: 'tender' },
  { path: 'company', populate: companyCpvPopulateFields },
];
