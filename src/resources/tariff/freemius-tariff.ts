import { TariffType } from './tariff.types';

export function resolveTariffTypeByFreemiusPlanName(
  planName: string | null | undefined,
): TariffType {
  if (!planName) {
    return TariffType.free;
  }

  return TariffType[planName] ?? TariffType.free;
}
