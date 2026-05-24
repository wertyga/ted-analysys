export enum TariffType {
  free = 'free',
  pro = 'pro',
  business = 'business',
}

export interface TariffSearchRule {
  enabled: boolean;
  maxResultsPerSearch?: number;
}

export interface TariffFeatureRule {
  enabled: boolean;
}

export interface TariffWishlistRule extends TariffFeatureRule {
  maxItems?: number;
}

export interface TariffRules {
  search: TariffSearchRule;
  basicAnalysis: {
    enabled: boolean;
  };
  companyFilter: {
    enabled: boolean;
  };
  deepAnalysis: TariffFeatureRule;
  companyDocuments: {
    uploadEnabled: boolean;
  };
  tenderMatching: TariffFeatureRule;
  notifications: TariffFeatureRule;
  wishlist: TariffWishlistRule;
}

export interface UserTariff {
  type: TariffType;
  rules: TariffRules;
}
