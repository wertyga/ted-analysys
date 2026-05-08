import buyerMainActivities from './buyer-main-activity.json';

export enum BuyerMainActivity {
  AIRPORT_RELATED_ACTIVITIES = 'airport',
  DEFENCE = 'defence',
  ECONOMIC_AFFAIRS = 'econ-aff',
  EDUCATION = 'education',
  ELECTRICITY_RELATED_ACTIVITIES = 'electricity',
  ENVIRONMENTAL_PROTECTION = 'env-pro',
  EXPLORATION_OR_EXTRACTION_OF_COAL_OR_OTHER_SOLID_FUELS = 'solid-fuel',
  EXTRACTION_OF_GAS_OR_OIL = 'gas-oil',
  GENERAL_PUBLIC_SERVICES = 'gen-pub',
  HEALTH = 'health',
  HOUSING_AND_COMMUNITY_AMENITIES = 'hc-am',
  OTHER_ACTIVITIES = '8_9_Z',
  PORT_RELATED_ACTIVITIES = 'port',
  POSTAL_SERVICES = 'post',
  PRODUCTION_TRANSPORT_OR_DISTRIBUTION_OF_GAS_OR_HEAT = 'gas-heat',
  PUBLIC_ORDER_AND_SAFETY = 'pub-os',
  RAILWAY_SERVICES = 'rail',
  RECREATION_CULTURE_AND_RELIGION = 'rcr',
  SOCIAL_PROTECTION = 'soc-pro',
  URBAN_RAILWAY_TRAMWAY_TROLLEYBUS_OR_BUS_SERVICES = 'urttb',
  WATER_RELATED_ACTIVITIES = 'water',
}

export interface BuyerMainActivityOption {
  code: BuyerMainActivity;
  name: string;
}

export const BUYER_MAIN_ACTIVITY_OPTIONS: BuyerMainActivityOption[] =
  buyerMainActivities.results
    .flatMap(({ codes, label }) =>
      codes.map((code) => ({
        code: code as BuyerMainActivity,
        name: label,
      })),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
