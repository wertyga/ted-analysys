import { TariffRules, TariffType } from './tariff.types';

export const TARIFF_RULES: Record<TariffType, TariffRules> = {
  [TariffType.free]: {
    search: {
      enabled: true,
      maxResultsPerSearch: 20,
    },
    basicAnalysis: {
      enabled: true,
      maxAnalyzedTendersPerSearch: 3,
    },
    companyFilter: {
      enabled: false,
    },
    deepAnalysis: {
      enabled: false,
    },
    companyDocuments: {
      uploadEnabled: false,
    },
    tenderMatching: {
      enabled: false,
    },
    notifications: {
      enabled: false,
    },
    wishlist: {
      enabled: true,
      maxItems: 5,
    },
  },
  [TariffType.pro]: {
    search: {
      enabled: true,
    },
    basicAnalysis: {
      enabled: true,
    },
    companyFilter: {
      enabled: true,
    },
    deepAnalysis: {
      enabled: true,
    },
    companyDocuments: {
      uploadEnabled: true,
    },
    tenderMatching: {
      enabled: true,
    },
    notifications: {
      enabled: true,
    },
    wishlist: {
      enabled: true,
    },
  },
  [TariffType.business]: {
    search: {
      enabled: true,
    },
    basicAnalysis: {
      enabled: true,
    },
    deepAnalysis: {
      enabled: true,
    },
    companyFilter: {
      enabled: true,
    },
    companyDocuments: {
      uploadEnabled: true,
    },
    tenderMatching: {
      enabled: true,
    },
    notifications: {
      enabled: true,
    },
    wishlist: {
      enabled: true,
    },
  },
};
