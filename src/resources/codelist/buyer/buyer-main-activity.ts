import buyerMainActivities from './buyer-main-activity.data.json';

export interface BuyerMainActivityOption {
  code: string;
  name: string;
}

export const BUYER_MAIN_ACTIVITY_OPTIONS: BuyerMainActivityOption[] =
  buyerMainActivities
    .flatMap(({ codes, label }) =>
      codes.map((code) => ({
        code,
        name: label,
      })),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

const BUYER_MAIN_ACTIVITY_BY_CODE = new Map(
  BUYER_MAIN_ACTIVITY_OPTIONS.map((option) => [option.code, option]),
);

export function getMainActivities(codes: string[]): BuyerMainActivityOption[] {
  return codes
    .map((code) => BUYER_MAIN_ACTIVITY_BY_CODE.get(code))
    .filter((option): option is BuyerMainActivityOption => !!option);
}
