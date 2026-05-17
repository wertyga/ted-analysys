import { Types } from 'mongoose';

export enum TenderMatchDecision {
  REJECT = 'reject',
  CANDIDATE = 'candidate',
  GOOD_FIT = 'good_fit',
  STRONG_FIT = 'strong_fit',
}

export enum HardMatchStatus {
  MATCHED = 'matched',
  REJECTED = 'rejected',
  STALE = 'stale',
}

export enum MatchStaleReason {
  COMPANY_PROFILE_UPDATED = 'company_profile_updated',
  TENDER_UPDATED = 'tender_updated',
}

export enum TenderMatchSource {
  COMPANY_PROFILE_UPDATED = 'company_profile_updated',
  TENDER_UPDATED = 'tender_updated',
}

export enum AiFitStatus {
  NOT_STARTED = 'not_started',
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum AiFitDecision {
  REJECT = 'reject',
  MAYBE = 'maybe',
  GOOD_FIT = 'good_fit',
  STRONG_FIT = 'strong_fit',
}

export enum NotificationStatus {
  NOT_CREATED = 'not_created',
  PENDING = 'pending',
  SENT = 'sent',
  SKIPPED = 'skipped',
}

export type CompanyTenderFilterCpvMatchLevel = 'broad' | 'medium' | 'specific';

export interface TenderForMatching {
  id: string;
  title: string;
  description?: string;
  cpvCodes: string[];
  country?: string | null;
  buyerCountry?: string | null;
  placeOfPerformanceCountry?: string | null;
  estimatedValue?: number | null;
  currency?: string | null;
  publicationDate?: Date | null;
  deadlineAt?: Date | null;
  contractNature?: string | null;
  procedureType?: string | null;
  languages?: string[];
  buyerName?: string | null;
  titleLot?: string[];
  descriptionLot?: string[];
}

export interface CompanyTenderFilterForMatching {
  _id?: Types.ObjectId | string;
  company?: Types.ObjectId | string | null;
  user?: Types.ObjectId | string | null;
  summary?: string;
  cpvCodes: {
    category?: Types.ObjectId | string | null;
    code: string;
    label?: string;
    source?: string;
    matchLevel: CompanyTenderFilterCpvMatchLevel;
    confidence?: number;
    reason?: string;
  }[];
  targetCountries: string[];
  excludedCountries: string[];
  languages?: string[];
  contractNatures: string[];
  minBudget?: number | null;
  maxBudget?: number | null;
  currency?: string | null;
  minDaysBeforeDeadline: number;
  requiredKeywords: string[];
  optionalKeywords: string[];
  excludedKeywords: string[];
  certifications?: string[];
  capabilities?: string[];
  publicProcurementExperience?: boolean | null;
  notificationThreshold: number;
  confirmedByUser?: boolean;
}

export interface TenderCompanyMatchResult {
  matched: boolean;
  status: HardMatchStatus;
  score: number;
  decision: TenderMatchDecision;
  reasons: string[];
  risks: string[];
  keywordHits: string[];
}

export type CompanyTenderFitAiPayload = {
  company: {
    name?: string;
    summary?: string;
    targetCountries: string[];
    languages: string[];
    capabilities: string[];
    certifications: string[];
    publicProcurementExperience: boolean | null;
    minBudget: number | null;
    maxBudget: number | null;
    currency: string | null;
    cpvCodes: {
      code: string;
      label?: string;
      source?: string;
      matchLevel?: string;
    }[];
    optionalKeywords: string[];
    requiredKeywords: string[];
  };
  tender: {
    id: string;
    title: string;
    description?: string;
    cpvCodes: string[];
    buyerName?: string;
    buyerCountry?: string;
    placeOfPerformanceCountries: string[];
    estimatedValue: {
      amount: number | null;
      currency: string | null;
      amountEur?: number | null;
    };
    deadlineAt?: string | null;
    publicationDate?: string | null;
    contractNature?: string | null;
    procedureType?: string | null;
    noticeLanguage?: string | null;
    submissionLanguages: string[];
    selectionCriteria: {
      name?: string | null;
      description?: string | null;
    }[];
    awardCriteria: {
      name?: string | null;
      description?: string | null;
      type?: string | null;
      weight?: number | null;
    }[];
  };
  hardMatch: {
    score: number;
    decision: string;
    reasons: string[];
    risks: string[];
    keywordHits: string[];
  };
};

export interface CompanyTenderFitAiResult {
  score: number;
  decision: AiFitDecision;
  summary: string;
  reasons: string[];
  risks: string[];
}

export interface CpvMatchResult {
  matched: boolean;
  score: number;
  tenderCode?: string;
  filterCode?: string;
  matchLevel?: CompanyTenderFilterCpvMatchLevel | 'exact';
}

export interface RuleMatchResult {
  rejected: boolean;
  score: number;
  reasons: string[];
  risks: string[];
  keywordHits?: string[];
}
