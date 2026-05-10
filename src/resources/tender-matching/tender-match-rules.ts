import {
  CompanyTenderFilterCpvMatchLevel,
  CompanyTenderFilterForMatching,
  CpvMatchResult,
  RuleMatchResult,
  TenderCompanyMatchResult,
  TenderForMatching,
  TenderMatchDecision,
  HardMatchStatus,
} from './tender-match.types';

const MAX_SCORE = 100;

export function normalizeCpv(cpv: string): string {
  return cpv.replace(/\D/g, '').slice(0, 8);
}

export function buildTenderText(tender: TenderForMatching): string {
  return [
    tender.title,
    tender.description,
    tender.buyerName,
    ...(tender.cpvCodes ?? []),
    ...(tender.titleLot ?? []),
    ...(tender.descriptionLot ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function findKeywordHits(text: string, keywords: string[]): string[] {
  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();

  return Array.from(
    new Set(
      keywords
        .map((keyword) => keyword.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter(Boolean)
        .filter((keyword) => normalizedText.includes(keyword)),
    ),
  );
}

export function matchExcludedKeywords(
  tenderText: string,
  excludedKeywords: string[],
): RuleMatchResult {
  const hits = findKeywordHits(tenderText, excludedKeywords);

  if (hits.length === 0) {
    return { rejected: false, score: 0, reasons: [], risks: [] };
  }

  return {
    rejected: true,
    score: 0,
    reasons: [`Excluded keyword found: ${hits.join(', ')}`],
    risks: [],
    keywordHits: hits,
  };
}

export function matchCpv(
  tenderCpvCodes: string[],
  filterCpvCodes: CompanyTenderFilterForMatching['cpvCodes'],
): CpvMatchResult {
  let bestMatch: CpvMatchResult = { matched: false, score: 0 };

  for (const tenderCodeRaw of tenderCpvCodes) {
    const tenderCode = normalizeCpv(tenderCodeRaw);

    if (!tenderCode) {
      continue;
    }

    for (const filterCodeConfig of filterCpvCodes) {
      const filterCode = normalizeCpv(filterCodeConfig.code);

      if (!filterCode) {
        continue;
      }

      const candidate = getCpvMatchCandidate(
        tenderCode,
        filterCode,
        filterCodeConfig.matchLevel,
      );

      if (candidate.score > bestMatch.score) {
        bestMatch = {
          ...candidate,
          tenderCode,
          filterCode,
        };
      }
    }
  }

  return bestMatch;
}

export function matchCountry(
  tender: TenderForMatching,
  filter: CompanyTenderFilterForMatching,
): RuleMatchResult {
  const tenderCountry = normalizeCountry(
    tender.placeOfPerformanceCountry ?? tender.country ?? tender.buyerCountry,
  );
  const excludedCountries = filter.excludedCountries.map(normalizeCountry);
  const targetCountries = filter.targetCountries.map(normalizeCountry);

  if (!tenderCountry) {
    return {
      rejected: false,
      score: 0,
      reasons: [],
      risks: ['Tender country is missing'],
    };
  }

  if (excludedCountries.includes(tenderCountry)) {
    return {
      rejected: true,
      score: 0,
      reasons: [`Tender country is excluded: ${tenderCountry}`],
      risks: [],
    };
  }

  if (targetCountries.length === 0) {
    return { rejected: false, score: 0, reasons: [], risks: [] };
  }

  if (!targetCountries.includes(tenderCountry)) {
    return {
      rejected: true,
      score: 0,
      reasons: [`Tender country is outside target countries: ${tenderCountry}`],
      risks: [],
    };
  }

  return { rejected: false, score: 20, reasons: [], risks: [] };
}

export function matchDeadline(
  deadlineAt: Date | null | undefined,
  minDaysBeforeDeadline: number,
  now = new Date(),
): RuleMatchResult {
  if (!deadlineAt) {
    return {
      rejected: false,
      score: 0,
      reasons: [],
      risks: ['Tender deadline is missing'],
    };
  }

  const minimumDeadline = new Date(now);
  minimumDeadline.setDate(minimumDeadline.getDate() + minDaysBeforeDeadline);

  if (deadlineAt < minimumDeadline) {
    return {
      rejected: true,
      score: 0,
      reasons: ['Deadline is too close'],
      risks: [],
    };
  }

  return { rejected: false, score: 15, reasons: [], risks: [] };
}

export function matchBudget(
  tender: TenderForMatching,
  filter: CompanyTenderFilterForMatching,
): RuleMatchResult {
  if (tender.estimatedValue === null || tender.estimatedValue === undefined) {
    if (!filter.allowUnknownBudget) {
      return {
        rejected: true,
        score: 0,
        reasons: ['Budget is missing'],
        risks: [],
      };
    }

    return {
      rejected: false,
      score: 0,
      reasons: [],
      risks: ['Budget is missing'],
    };
  }

  if (
    filter.currency &&
    tender.currency &&
    normalizeCurrency(filter.currency) !== normalizeCurrency(tender.currency)
  ) {
    return {
      rejected: false,
      score: 0,
      reasons: [],
      risks: ['Tender currency differs from company filter currency'],
    };
  }

  if (filter.minBudget !== null && filter.minBudget !== undefined) {
    if (tender.estimatedValue < filter.minBudget) {
      return {
        rejected: true,
        score: 0,
        reasons: ['Budget is below company minimum'],
        risks: [],
      };
    }
  }

  if (filter.maxBudget !== null && filter.maxBudget !== undefined) {
    if (tender.estimatedValue > filter.maxBudget) {
      return {
        rejected: true,
        score: 0,
        reasons: ['Budget is above company maximum'],
        risks: [],
      };
    }
  }

  return { rejected: false, score: 15, reasons: [], risks: [] };
}

export function matchContractNature(
  contractNature: string | null | undefined,
  contractNatures: string[],
): RuleMatchResult {
  if (contractNatures.length === 0) {
    return { rejected: false, score: 0, reasons: [], risks: [] };
  }

  if (!contractNature) {
    return {
      rejected: false,
      score: 0,
      reasons: [],
      risks: ['Contract nature is missing'],
    };
  }

  const normalizedContractNature = contractNature.toLowerCase();
  const normalizedContractNatures = contractNatures.map((value) =>
    value.toLowerCase(),
  );

  if (normalizedContractNatures.includes(normalizedContractNature)) {
    return { rejected: false, score: 5, reasons: [], risks: [] };
  }

  return {
    rejected: false,
    score: -5,
    reasons: [],
    risks: [`Contract nature may not match: ${contractNature}`],
  };
}

export function matchRequiredKeywords(
  tenderText: string,
  requiredKeywords: string[],
): RuleMatchResult {
  const normalizedKeywords = requiredKeywords.filter(
    (keyword) => keyword.trim().length > 0,
  );

  if (normalizedKeywords.length === 0) {
    return { rejected: false, score: 0, reasons: [], risks: [] };
  }

  const hits = findKeywordHits(tenderText, normalizedKeywords);

  if (hits.length === 0) {
    return {
      rejected: true,
      score: 0,
      reasons: ['No required keywords found'],
      risks: [],
    };
  }

  return {
    rejected: false,
    score: 10,
    reasons: [],
    risks: [],
    keywordHits: hits,
  };
}

export function scoreOptionalKeywords(
  tenderText: string,
  optionalKeywords: string[],
): RuleMatchResult {
  const hits = findKeywordHits(tenderText, optionalKeywords);

  return {
    rejected: false,
    score: Math.min(hits.length * 2, 10),
    reasons: [],
    risks: [],
    keywordHits: hits,
  };
}

export function getDecision(score: number): TenderMatchDecision {
  if (score >= 90) {
    return TenderMatchDecision.STRONG_FIT;
  }

  if (score >= 75) {
    return TenderMatchDecision.GOOD_FIT;
  }

  if (score >= 60) {
    return TenderMatchDecision.CANDIDATE;
  }

  return TenderMatchDecision.REJECT;
}

export function matchTenderWithCompanyFilter(
  tender: TenderForMatching,
  filter: CompanyTenderFilterForMatching,
  now = new Date(),
): TenderCompanyMatchResult {
  const tenderText = buildTenderText(tender);
  const reasons: string[] = [];
  const risks: string[] = [];
  const keywordHits = new Set<string>();
  let score = 0;

  const excludedKeywordMatch = matchExcludedKeywords(
    tenderText,
    filter.excludedKeywords,
  );

  if (excludedKeywordMatch.rejected) {
    return hardReject(
      excludedKeywordMatch.reasons,
      [],
      [...(excludedKeywordMatch.keywordHits ?? [])],
    );
  }

  const cpvMatch = matchCpv(tender.cpvCodes, filter.cpvCodes);

  if (!cpvMatch.matched) {
    return hardReject(['No CPV match'], [], []);
  }

  score += cpvMatch.score;

  const orderedRules: RuleMatchResult[] = [
    matchCountry(tender, filter),
    matchDeadline(tender.deadlineAt, filter.minDaysBeforeDeadline, now),
    matchBudget(tender, filter),
    matchContractNature(tender.contractNature, filter.contractNatures),
    matchRequiredKeywords(tenderText, filter.requiredKeywords),
    scoreOptionalKeywords(tenderText, filter.optionalKeywords),
  ];

  for (const ruleResult of orderedRules) {
    if (ruleResult.rejected) {
      return hardReject(ruleResult.reasons, risks, Array.from(keywordHits));
    }

    score += ruleResult.score;
    reasons.push(...ruleResult.reasons);
    risks.push(...ruleResult.risks);

    for (const keywordHit of ruleResult.keywordHits ?? []) {
      keywordHits.add(keywordHit);
    }
  }

  const clampedScore = clampScore(score);
  const decision = getDecision(clampedScore);
  const matched = clampedScore >= 60;

  return {
    matched,
    status: matched ? HardMatchStatus.MATCHED : HardMatchStatus.REJECTED,
    score: clampedScore,
    decision,
    reasons,
    risks,
    keywordHits: Array.from(keywordHits),
  };
}

function getCpvMatchCandidate(
  tenderCode: string,
  filterCode: string,
  matchLevel: CompanyTenderFilterCpvMatchLevel,
): CpvMatchResult {
  if (tenderCode === filterCode) {
    return { matched: true, score: 40, matchLevel: 'exact' };
  }

  const prefixLengthByMatchLevel: Record<
    CompanyTenderFilterCpvMatchLevel,
    number
  > = {
    specific: 6,
    medium: 4,
    broad: 2,
  };
  const scoreByMatchLevel: Record<CompanyTenderFilterCpvMatchLevel, number> = {
    specific: 35,
    medium: 30,
    broad: 20,
  };
  const prefixLength = prefixLengthByMatchLevel[matchLevel];

  if (
    tenderCode.length >= prefixLength &&
    filterCode.length >= prefixLength &&
    tenderCode.slice(0, prefixLength) === filterCode.slice(0, prefixLength)
  ) {
    return {
      matched: true,
      score: scoreByMatchLevel[matchLevel],
      matchLevel,
    };
  }

  return { matched: false, score: 0 };
}

function hardReject(
  reasons: string[],
  risks: string[],
  keywordHits: string[],
): TenderCompanyMatchResult {
  return {
    matched: false,
    status: HardMatchStatus.REJECTED,
    score: 0,
    decision: TenderMatchDecision.REJECT,
    reasons,
    risks,
    keywordHits,
  };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(score, MAX_SCORE));
}

function normalizeCountry(country: string | null | undefined): string {
  return country?.trim().toUpperCase() ?? '';
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}
