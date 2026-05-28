import { TED_SEARCH_CONFIG } from '@/config/ted-search.config';

export const TED_COMPETITION_LOT_FIELDS =
  TED_SEARCH_CONFIG.competitionLotFields;

export const searchTendersDefaultFields = Array.from(
  new Set([
    ...TED_SEARCH_CONFIG.baseDefaultFields,
    ...TED_COMPETITION_LOT_FIELDS,
  ]),
);
