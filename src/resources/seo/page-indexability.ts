import { TenderModel } from '@/resources/tenders/schemas';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { normalizeTedCountryCodes } from '@/resources/codelist';
import {
  getNarrowerCodes,
  normalizeCpvCodes,
} from '@/resources/ted-search/ted-builders/ted-cpv.builder';

// Single source of the content gate for country / industry / country_industry
// pages (SITE_BRIEF.md): a page is indexable when its scope has an active
// tender, a tender closed in the last 365 days or an award in the last
// 12 months. search-pure endpoints return it as `indexable`, the sitemap
// includes only indexable URLs.

export type PageIndexabilityScope = {
  cpvCodes?: string[];
  placeOfPerformance?: string[];
};

type ScopeDocument = {
  cpvCodes?: string[];
  placeOfPerformanceCountries?: string[];
};

export function getIndexabilityWindows(now = new Date()) {
  // Active tenders (deadline >= now) and tenders closed in the last 365 days
  // collapse into one condition: deadline >= now - 365d
  const tenderDeadlineFrom = new Date(now);
  tenderDeadlineFrom.setDate(tenderDeadlineFrom.getDate() - 365);

  const awardDateFrom = new Date(now);
  awardDateFrom.setMonth(awardDateFrom.getMonth() - 12);

  return { tenderDeadlineFrom, awardDateFrom };
}

// Same cpv / country matching as the local search query
function buildScopeFilter(scope: PageIndexabilityScope) {
  const parts: Record<string, unknown>[] = [];
  const cpvCodes = getNarrowerCodes(normalizeCpvCodes(scope.cpvCodes ?? []));
  const countries = normalizeTedCountryCodes(scope.placeOfPerformance);

  if (cpvCodes.length) {
    parts.push({ cpvCodes: { $in: cpvCodes } });
  }

  if (countries.length) {
    parts.push({ placeOfPerformanceCountries: { $in: countries } });
  }

  return parts;
}

export async function isPageIndexable(
  scope: PageIndexabilityScope,
  now = new Date(),
): Promise<boolean> {
  const { tenderDeadlineFrom, awardDateFrom } = getIndexabilityWindows(now);
  const scopeFilter = buildScopeFilter(scope);

  const [tender, award] = await Promise.all([
    TenderModel.exists({
      $and: [
        ...scopeFilter,
        { submissionDeadline: { $gte: tenderDeadlineFrom } },
      ],
    }),
    AwardTenderModel.exists({
      $and: [...scopeFilter, { awardDate: { $gte: awardDateFrom } }],
    }),
  ]);

  return !!tender || !!award;
}

export function getCountryCpvKey(countryCode: string, cpvCode: string) {
  return `${countryCode}|${cpvCode}`;
}

// Bulk variant of isPageIndexable for the sitemap: every country, cpv code
// and country + cpv code pair that has qualifying tenders or awards
export async function getIndexableScopes(now = new Date()) {
  const { tenderDeadlineFrom, awardDateFrom } = getIndexabilityWindows(now);

  const countries = new Set<string>();
  const cpvCodes = new Set<string>();
  const countryCpvKeys = new Set<string>();

  const collect = (doc: ScopeDocument) => {
    const docCountries = doc.placeOfPerformanceCountries ?? [];
    const docCpvCodes = doc.cpvCodes ?? [];

    for (const countryCode of docCountries) {
      countries.add(countryCode);
    }

    for (const cpvCode of docCpvCodes) {
      cpvCodes.add(cpvCode);

      for (const countryCode of docCountries) {
        countryCpvKeys.add(getCountryCpvKey(countryCode, cpvCode));
      }
    }
  };

  const tenderCursor = TenderModel.find({
    submissionDeadline: { $gte: tenderDeadlineFrom },
  })
    .select('cpvCodes placeOfPerformanceCountries')
    .lean<ScopeDocument>()
    .cursor();

  const awardCursor = AwardTenderModel.find({
    awardDate: { $gte: awardDateFrom },
  })
    .select('cpvCodes placeOfPerformanceCountries')
    .lean<ScopeDocument>()
    .cursor();

  for await (const tender of tenderCursor) {
    collect(tender);
  }

  for await (const award of awardCursor) {
    collect(award);
  }

  return { countries, cpvCodes, countryCpvKeys };
}
