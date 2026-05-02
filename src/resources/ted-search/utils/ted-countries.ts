export const TED_ELIGIBLE_COUNTRIES = {
  AUT: 'Austria',
  BEL: 'Belgium',
  BGR: 'Bulgaria',
  CYP: 'Cyprus',
  CZE: 'Czechia',
  DEU: 'Germany',
  DNK: 'Denmark',
  ESP: 'Spain',
  EST: 'Estonia',
  FIN: 'Finland',
  FRA: 'France',
  GRC: 'Greece',
  HRV: 'Croatia',
  HUN: 'Hungary',
  IRL: 'Ireland',
  ISL: 'Iceland',
  ITA: 'Italy',
  LIE: 'Liechtenstein',
  LTU: 'Lithuania',
  LUX: 'Luxembourg',
  LVA: 'Latvia',
  MLT: 'Malta',
  NLD: 'Netherlands',
  NOR: 'Norway',
  POL: 'Poland',
  PRT: 'Portugal',
  ROU: 'Romania',
  SVK: 'Slovakia',
  SVN: 'Slovenia',
  SWE: 'Sweden',
} as const;

export type TedEligibleCountryCode = keyof typeof TED_ELIGIBLE_COUNTRIES;

export const TED_ELIGIBLE_COUNTRY_CODES = Object.keys(
  TED_ELIGIBLE_COUNTRIES,
) as TedEligibleCountryCode[];

const TED_ELIGIBLE_COUNTRY_CODE_SET = new Set<string>(
  TED_ELIGIBLE_COUNTRY_CODES,
);

export function normalizeTedCountryCodes(
  countries: string[] | undefined,
): TedEligibleCountryCode[] {
  const normalized =
    countries
      ?.map((country) => country.trim().toUpperCase())
      .filter((country) => TED_ELIGIBLE_COUNTRY_CODE_SET.has(country)) ?? [];

  return Array.from(new Set(normalized)) as TedEligibleCountryCode[];
}
