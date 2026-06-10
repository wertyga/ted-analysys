export interface TenderLotAnalysisInput {
  identifier?: string;
  internalIdentifier?: string;
  title?: string;
  description?: string;
  mainClassification?: string[];
  additionalClassifications?: string[];
  contractNature?: string;
  estimatedValue?: {
    amount: number | null;
    currency: string | null;
  };
  frameworkMaximumValue?: {
    amount: number | null;
    currency: string | null;
  };
  isFrameworkAgreement?: boolean;
  isDps?: boolean;
  durationPeriodValue?: string;
  durationPeriodUnit?: string;
  deadlineReceiptTender?: string | null;
  documentUrls?: string[];
  submissionUrls?: string[];
  electronicSubmission?: string;
  submissionLanguages?: string[];
  placeOfPerformanceCountries?: string[];
  placeOfPerformanceSubdivisions?: string[];
  placeOfPerformanceCities?: string[];
  awardCriteria?: unknown[];
  selectionCriteria?: unknown[];
  selectionCriteriaSource?: string;
}
