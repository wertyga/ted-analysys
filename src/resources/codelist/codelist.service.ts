import { Injectable } from '@nestjs/common';
import {
  BUYER_LEGAL_TYPE_OPTIONS,
  BUYER_MAIN_ACTIVITY_OPTIONS,
  CURRENCY_OPTIONS,
  TED_ELIGIBLE_COUNTRIES,
  type BuyerLegalTypeOption,
  type BuyerMainActivityOption,
  type CurrencyOption,
} from '@/resources/codelist';

export interface CodelistCountryOption {
  code: string;
  name: string;
}

@Injectable()
export class CodelistService {
  getCountries(): CodelistCountryOption[] {
    return Object.entries(TED_ELIGIBLE_COUNTRIES)
      .map(([code, name]) => ({ code, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getCurrencies(): CurrencyOption[] {
    return CURRENCY_OPTIONS;
  }

  getBuyerLegalTypes(): BuyerLegalTypeOption[] {
    return BUYER_LEGAL_TYPE_OPTIONS;
  }

  getBuyerMainActivities(): BuyerMainActivityOption[] {
    return BUYER_MAIN_ACTIVITY_OPTIONS;
  }
}
