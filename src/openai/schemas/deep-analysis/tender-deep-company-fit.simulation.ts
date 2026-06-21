import { TenderDeepAnalysisResult } from '@/types';

type DecisionReadinessItem = {
  id: string;
  label: string;
  source:
    | 'missing_document'
    | 'gap'
    | 'risk'
    | 'required_before_decision'
    | 'condition_for_bid';
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  impact: {
    fitIncrease: number;
    riskReduction: number;
    readinessIncrease: number;
    docCompletenessIncrease: number;
  };
};

type DecisionReadinessSimulation = {
  items: DecisionReadinessItem[];
  current: {
    fitScore: number;
    riskScore: number;
    readinessScore: number;
    documentationCompletenessScore: number;
  };
  simulated: {
    fitScore: number;
    riskScore: number;
    readinessScore: number;
    documentationCompletenessScore: number;
    recommendation: 'investigate' | 'caution' | 'go';
  };
};

const IMPACT = {
  critical: {
    fitIncrease: 8,
    riskReduction: 10,
    readinessIncrease: 10,
    docCompletenessIncrease: 8,
  },
  high: {
    fitIncrease: 5,
    riskReduction: 7,
    readinessIncrease: 7,
    docCompletenessIncrease: 5,
  },
  medium: {
    fitIncrease: 3,
    riskReduction: 4,
    readinessIncrease: 4,
    docCompletenessIncrease: 3,
  },
  low: {
    fitIncrease: 1,
    riskReduction: 2,
    readinessIncrease: 2,
    docCompletenessIncrease: 1,
  },
} as const;

function simulateReadinessImpact(
  analysis: TenderDeepAnalysisResult,
  items: DecisionReadinessItem[],
) {
  const selected = items.filter((x) => x.resolved);

  const impact = selected.reduce(
    (acc, item) => ({
      fitIncrease: acc.fitIncrease + item.impact.fitIncrease,
      riskReduction: acc.riskReduction + item.impact.riskReduction,
      readinessIncrease: acc.readinessIncrease + item.impact.readinessIncrease,
      docCompletenessIncrease:
        acc.docCompletenessIncrease + item.impact.docCompletenessIncrease,
    }),
    {
      fitIncrease: 0,
      riskReduction: 0,
      readinessIncrease: 0,
      docCompletenessIncrease: 0,
    },
  );

  return {
    current: {
      fitScore: analysis.scores.fitScore,
      riskScore: analysis.scores.riskScore,
      readinessScore: analysis.scores.participationReadinessScore,
      documentationCompletenessScore:
        analysis.scores.documentationCompletenessScore,
    },
    simulated: {
      fitScore: clamp(analysis.scores.fitScore + impact.fitIncrease),
      riskScore: clamp(analysis.scores.riskScore - impact.riskReduction),
      readinessScore: clamp(
        analysis.scores.participationReadinessScore + impact.readinessIncrease,
      ),
      documentationCompletenessScore: clamp(
        analysis.scores.documentationCompletenessScore +
          impact.docCompletenessIncrease,
      ),
    },
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getSimulatedRecommendation(simulated: {
  fitScore: number;
  riskScore: number;
  readinessScore: number;
}) {
  if (simulated.readinessScore < 40 || simulated.riskScore >= 75) {
    return 'investigate';
  }

  if (simulated.fitScore >= 70 && simulated.riskScore < 50) {
    return 'go';
  }

  return 'caution';
}

export function buildDecisionReadinessItems(
  analysis: TenderDeepAnalysisResult,
  resolvedIds: string[] = [],
): DecisionReadinessItem[] {
  const resolved = new Set(resolvedIds);

  const items: DecisionReadinessItem[] = [];

  analysis.documentationAnalysis.missingDocuments.forEach((doc, index) => {
    const severity = normalizeSeverity(doc.importance);

    items.push({
      id: `missing_document:${index}:${slug(doc.name)}`,
      label: doc.name,
      source: 'missing_document',
      severity,
      resolved: resolved.has(`missing_document:${index}:${slug(doc.name)}`),
      impact: IMPACT[severity],
    });
  });

  analysis.companyFitAnalysis.gaps.forEach((gap, index) => {
    if (!gap.mustResolveBeforeBid) return;

    const severity = normalizeSeverity(gap.severity);

    items.push({
      id: `gap:${index}:${slug(gap.title)}`,
      label: gap.title,
      source: 'gap',
      severity,
      resolved: resolved.has(`gap:${index}:${slug(gap.title)}`),
      impact: IMPACT[severity],
    });
  });

  analysis.riskAnalysis.companySpecificRisks.forEach((risk, index) => {
    if (!['high', 'critical'].includes(risk.severity)) return;

    const severity = normalizeSeverity(risk.severity);

    items.push({
      id: `risk:company:${index}:${slug(risk.title)}`,
      label: risk.title,
      source: 'risk',
      severity,
      resolved: resolved.has(`risk:company:${index}:${slug(risk.title)}`),
      impact: IMPACT[severity],
    });
  });

  analysis.bidNoBidDecision.requiredBeforeDecision.forEach((label, index) => {
    const severity = 'high';

    items.push({
      id: `required_before_decision:${index}:${slug(label)}`,
      label,
      source: 'required_before_decision',
      severity,
      resolved: resolved.has(
        `required_before_decision:${index}:${slug(label)}`,
      ),
      impact: IMPACT[severity],
    });
  });

  analysis.bidNoBidDecision.conditionsForBid.forEach((label, index) => {
    const severity = 'high';

    items.push({
      id: `condition_for_bid:${index}:${slug(label)}`,
      label,
      source: 'condition_for_bid',
      severity,
      resolved: resolved.has(`condition_for_bid:${index}:${slug(label)}`),
      impact: IMPACT[severity],
    });
  });

  return dedupeItems(items);
}

function normalizeSeverity(value: string): DecisionReadinessItem['severity'] {
  const normalized = value.toLowerCase();

  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';

  return 'low';
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function dedupeItems(items: DecisionReadinessItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = slug(item.label);

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}
