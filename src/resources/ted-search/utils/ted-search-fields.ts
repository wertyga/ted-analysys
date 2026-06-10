import { TED_SEARCH_CONFIG } from '@/config/ted-search.config';

export const searchTendersDefaultFields = Array.from(
  new Set([
    ...TED_SEARCH_CONFIG.baseDefaultFields,
    ...TED_SEARCH_CONFIG.competitionLotFields,
  ]),
);
