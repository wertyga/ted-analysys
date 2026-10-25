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
// 12 months. country_industry pages (country + cpv) need at least
// COUNTRY_INDUSTRY_MIN_PROCUREMENTS of those together. search-pure endpoints
// return it as `indexable`, the sitemap includes only indexable URLs.

export const COUNTRY_INDUSTRY_MIN_PROCUREMENTS = 10;

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

  return { parts, isCountryIndustry: !!cpvCodes.length && !!countries.length };
}

export async function isPageIndexable(
  scope: PageIndexabilityScope,
  now = new Date(),
): Promise<boolean> {
  const { tenderDeadlineFrom, awardDateFrom } = getIndexabilityWindows(now);
  const { parts: scopeFilter, isCountryIndustry } = buildScopeFilter(scope);

  if (isCountryIndustry) {
    const limit = COUNTRY_INDUSTRY_MIN_PROCUREMENTS;
    const [tenders, awards] = await Promise.all([
      TenderModel.countDocuments(
        {
          $and: [
            ...scopeFilter,
            { submissionDeadline: { $gte: tenderDeadlineFrom } },
          ],
        },
        { limit },
      ),
      AwardTenderModel.countDocuments(
        { $and: [...scopeFilter, { awardDate: { $gte: awardDateFrom } }] },
        { limit },
      ),
    ]);

    return tenders + awards >= limit;
  }

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

// Bulk variant of isPageIndexable for the sitemap: every country and cpv code
// that has qualifying tenders or awards, and every country + cpv code pair
// with at least COUNTRY_INDUSTRY_MIN_PROCUREMENTS of them
export async function getIndexableScopes(now = new Date()) {
  const { tenderDeadlineFrom, awardDateFrom } = getIndexabilityWindows(now);

  const countries = new Set<string>();
  const cpvCodes = new Set<string>();
  const countryCpvCounts = new Map<string, number>();

  const collect = (doc: ScopeDocument) => {
    const docCountries = new Set(doc.placeOfPerformanceCountries ?? []);
    const docCpvCodes = new Set(doc.cpvCodes ?? []);

    for (const countryCode of docCountries) {
      countries.add(countryCode);
    }

    for (const cpvCode of docCpvCodes) {
      cpvCodes.add(cpvCode);

      for (const countryCode of docCountries) {
        const key = getCountryCpvKey(countryCode, cpvCode);
        countryCpvCounts.set(key, (countryCpvCounts.get(key) ?? 0) + 1);
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

  const countryCpvKeys = new Set<string>();

  for (const [key, count] of countryCpvCounts) {
    if (count >= COUNTRY_INDUSTRY_MIN_PROCUREMENTS) {
      countryCpvKeys.add(key);
    }
  }

  return { countries, cpvCodes, countryCpvKeys };
}

// Contractor pages without a name all get the same title, so only named
// contractors are indexable (detail endpoint `indexable` and the sitemap)
export const INDEXABLE_CONTRACTOR_FILTER = { name: { $nin: [null, ''] } };

export function isContractorIndexable(contractor: { name?: string | null }) {
  return !!contractor.name?.trim();
}

const TENDER_INDEXABLE_DAYS_AFTER_DEADLINE = 60;

// Tender pages stay indexable while open and for 60 days after the deadline
// (detail endpoint `indexable` and the sitemap). Tenders without a deadline
// are treated as open
function getTenderIndexableDeadlineFrom(now = new Date()) {
  const deadlineFrom = new Date(now);
  deadlineFrom.setDate(
    deadlineFrom.getDate() - TENDER_INDEXABLE_DAYS_AFTER_DEADLINE,
  );

  return deadlineFrom;
}

export function getIndexableTenderFilter(now = new Date()) {
  return {
    $or: [
      { submissionDeadline: null },
      { submissionDeadline: { $gte: getTenderIndexableDeadlineFrom(now) } },
    ],
  };
}

export function isTenderIndexable(
  tender: { submissionDeadline?: Date | string | null },
  now = new Date(),
) {
  if (!tender.submissionDeadline) {
    return true;
  }

  return (
    new Date(tender.submissionDeadline) >= getTenderIndexableDeadlineFrom(now)
  );
}
