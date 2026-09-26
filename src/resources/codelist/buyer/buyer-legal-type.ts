import buyerLegalTypes from './buyer-legal-type.data.json';

export interface BuyerLegalTypeOption {
  code: string;
  name: string;
}

export const BUYER_LEGAL_TYPE_OPTIONS: BuyerLegalTypeOption[] =
  buyerLegalTypes;

const BUYER_LEGAL_TYPE_BY_CODE = new Map(
  BUYER_LEGAL_TYPE_OPTIONS.map((option) => [option.code, option]),
);

export function getLegalTypes(codes: string[]): BuyerLegalTypeOption[] {
  return codes
    .map((code) => BUYER_LEGAL_TYPE_BY_CODE.get(code))
    .filter((option): option is BuyerLegalTypeOption => !!option);
}
