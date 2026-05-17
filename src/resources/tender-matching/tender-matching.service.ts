import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryFilter, Types, UpdateQuery } from 'mongoose';
import { CompanyTenderFilterModel } from '@/resources/company-filter/company-filter.schema';
import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import {
  getSafeErrorMessage,
  getPaginationMeta,
  getString,
  getStringArray,
  isRecord,
  logger,
  QueueAsyncConcurrency,
  readNumber,
  readString,
  readStringArray,
  toObjectId,
  toIsoString,
  tenderCpvPopulateFields,
} from '@/utils';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { mapTenderForMatching } from './tender-for-matching.mapper';
import { matchTenderWithCompanyFilter } from './tender-match-rules';
import {
  AiFitDecision,
  AiFitStatus,
  CompanyTenderFitAiPayload,
  CompanyTenderFitAiResult,
  CompanyTenderFilterForMatching,
  HardMatchStatus,
  NotificationStatus,
  TenderCompanyMatchResult,
  TenderMatchSource,
} from './tender-match.types';
import {
  TenderCompanyMatchDocument,
  TenderCompanyMatchModel,
} from './schemas/tender-company-match.schema';
import { gfTime } from '@/goldfish';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import { COMPANY_TENDER_FIT_SYSTEM_PROMPT } from './company-tender-fit.prompt';
import { UserModel } from '@/resources/user/user.schema';

const RECENT_ACTIVE_TENDERS_LOOKBACK_DAYS = 2;
const ACTIVE_COMPETITION_TENDERS_MATCH_BATCH_SIZE = 100;
const COMPANY_PROFILE_REMATCH_DEBOUNCE_MS = gfTime.minute;
const COMPANY_PROFILE_REMATCH_CONCURRENCY = 5;
const COMPANY_TENDER_AI_FIT_CONCURRENCY = 5;

interface DebouncedCompanyProfileRematch {
  filter: CompanyTenderFilterForMatching;
  timer?: ReturnType<typeof setTimeout>;
  promise: Promise<TenderCompanyMatchDocument[]>;
  resolve: (matches: TenderCompanyMatchDocument[]) => void;
  reject: (error: unknown) => void;
}

@Injectable()
export class TenderMatchingService {
  constructor(
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
  ) {}

  private readonly companyProfileRematchQueue = new QueueAsyncConcurrency(
    COMPANY_PROFILE_REMATCH_CONCURRENCY,
  );
  private readonly companyTenderAiFitQueue = new QueueAsyncConcurrency(
    COMPANY_TENDER_AI_FIT_CONCURRENCY,
  );
  private readonly debouncedCompanyProfileRematches = new Map<
    string,
    DebouncedCompanyProfileRematch
  >();

  matchTenderWithFilter(
    tender: TenderDocument,
    filter: CompanyTenderFilterForMatching,
  ): TenderCompanyMatchResult {
    return matchTenderWithCompanyFilter(mapTenderForMatching(tender), filter);
  }

  async findCompletedAiFitMatchesForUser(
    companyId: Types.ObjectId | string,
    minAiFitScore = 65,
    pagination: { page?: number; limit?: number } = {},
  ): Promise<{
    items: TenderCompanyMatchDocument[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const { page, limit, skip } = getPaginationMeta(pagination);

    if (!companyId) {
      return { items: [], page, limit, total: 0, totalPages: 0 };
    }

    const query: QueryFilter<TenderCompanyMatchDocument> = {
      company: companyId,
      hardMatchStatus: HardMatchStatus.MATCHED,
      aiFitStatus: AiFitStatus.COMPLETED,
      aiFitScore: { $gte: minAiFitScore },
    };
    const [items, total] = await Promise.all([
      TenderCompanyMatchModel.find(query)
        .sort({ aiFitScore: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'tender',
          populate: tenderCpvPopulateFields,
        })
        .exec(),
      TenderCompanyMatchModel.countDocuments(query).exec(),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async matchActiveRecentTendersWithCompanyFilter(
    filter: CompanyTenderFilterForMatching,
    source: TenderMatchSource,
  ): Promise<TenderCompanyMatchDocument[]> {
    const tenders = await this.findActiveRecentTenders();
    const matches = await Promise.all(
      tenders.map((tender) =>
        this.matchTenderWithCompanyFilter(tender, filter, source),
      ),
    );

    return matches.filter(Boolean) as TenderCompanyMatchDocument[];
  }

  async rematchActiveCompetitionTendersAfterCompanyProfileUpdated(
    filter: CompanyTenderFilterForMatching,
  ): Promise<TenderCompanyMatchDocument[]> {
    const companyId = toObjectId(filter.user);

    if (!companyId) {
      return [];
    }

    const companyKey = String(companyId);
    const existing = this.debouncedCompanyProfileRematches.get(companyKey);

    if (existing) {
      existing.filter = filter;

      if (existing.timer) {
        clearTimeout(existing.timer);
      }

      existing.timer = setTimeout(
        () => this.enqueueCompanyProfileRematch(companyKey, existing),
        COMPANY_PROFILE_REMATCH_DEBOUNCE_MS,
      );

      return existing.promise;
    }

    let resolvePromise!: (matches: TenderCompanyMatchDocument[]) => void;
    let rejectPromise!: (error: unknown) => void;
    const promise = new Promise<TenderCompanyMatchDocument[]>(
      (resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      },
    );
    const entry: DebouncedCompanyProfileRematch = {
      filter,
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
    };

    entry.timer = setTimeout(
      () => this.enqueueCompanyProfileRematch(companyKey, entry),
      COMPANY_PROFILE_REMATCH_DEBOUNCE_MS,
    );
    this.debouncedCompanyProfileRematches.set(companyKey, entry);

    return promise;
  }

  private enqueueCompanyProfileRematch(
    companyKey: string,
    entry: DebouncedCompanyProfileRematch,
  ): void {
    entry.timer = undefined;

    this.companyProfileRematchQueue
      .push(async () => {
        if (this.debouncedCompanyProfileRematches.get(companyKey) === entry) {
          this.debouncedCompanyProfileRematches.delete(companyKey);
        }

        return this.rematchActiveCompetitionTendersWithCompanyFilter(
          entry.filter,
        );
      })
      .then(entry.resolve, entry.reject);
  }

  private async rematchActiveCompetitionTendersWithCompanyFilter(
    filter: CompanyTenderFilterForMatching,
  ): Promise<TenderCompanyMatchDocument[]> {
    const savedMatches: TenderCompanyMatchDocument[] = [];
    let lastTenderId: Types.ObjectId | undefined;

    while (true) {
      const tenders =
        await this.findActiveCompetitionTendersBatch(lastTenderId);

      if (tenders.length === 0) {
        break;
      }

      const matches = await Promise.all(
        tenders.map(async (tender) => {
          return this.matchTenderWithCompanyFilter(
            tender,
            filter,
            TenderMatchSource.COMPANY_PROFILE_UPDATED,
          );
        }),
      );

      savedMatches.push(
        ...(matches.filter(Boolean) as TenderCompanyMatchDocument[]),
      );

      lastTenderId = toObjectId(tenders[tenders.length - 1]._id) ?? undefined;
    }

    return savedMatches;
  }

  async matchTenderWithAllCompanyFilters(
    tender: TenderDocument,
    source: TenderMatchSource,
  ): Promise<TenderCompanyMatchDocument[]> {
    const companyFilters = await CompanyTenderFilterModel.find({
      confirmedByUser: true,
    }).exec();

    return this.matchTenderWithFilters(tender, companyFilters, source);
  }

  private async matchTenderWithFilters(
    tender: TenderDocument,
    companyFilters: CompanyTenderFilterForMatching[],
    source: TenderMatchSource,
  ): Promise<TenderCompanyMatchDocument[]> {
    const matches = await Promise.all(
      companyFilters.map((filter) =>
        this.matchTenderWithCompanyFilter(tender, filter, source),
      ),
    );

    return matches.filter(Boolean) as TenderCompanyMatchDocument[];
  }

  private async matchTenderWithCompanyFilter(
    tender: TenderDocument,
    filter: CompanyTenderFilterForMatching,
    source: TenderMatchSource,
  ): Promise<TenderCompanyMatchDocument | undefined> {
    const companyId = toObjectId(filter.user);

    if (!companyId) {
      return undefined;
    }

    const result = this.matchTenderWithFilter(tender, filter);
    const tenderId = toObjectId(tender._id);
    const filterId = toObjectId(filter._id);

    if (result.status !== HardMatchStatus.MATCHED) {
      await this.markMatchedMatchStale(tenderId, companyId, source);

      return undefined;
    }

    const savedMatch = await this.saveMatch(
      tenderId,
      companyId,
      filterId,
      result,
    );

    if (result.score < filter.notificationThreshold) {
      return savedMatch;
    }

    this.companyTenderAiFitQueue
      .push(() =>
        this.evaluateTenderCompanyFitForNotification(
          savedMatch,
          tender,
          filter,
        ),
      )
      .catch((error: unknown) =>
        logger.info('TENDER_COMPANY_AI_FIT_FAILED', {
          tenderId: tenderId ? String(tenderId) : null,
          companyId: String(companyId),
          error: getSafeErrorMessage(error),
        }),
      );

    return savedMatch;
  }

  async evaluateTenderCompanyFitForNotification(
    match: TenderCompanyMatchDocument,
    tender: TenderDocument,
    filter: CompanyTenderFilterForMatching,
  ): Promise<TenderCompanyMatchDocument | null> {
    await this.setTenderMatchPendingStatus(match._id);

    try {
      const payload = await this.buildCompanyTenderFitPayload(
        tender,
        filter,
        match,
      );
      const result = await this.analyzeCompanyTenderFit(payload);

      return TenderCompanyMatchModel.findByIdAndUpdate(
        match._id,
        {
          $set: {
            aiFitStatus: AiFitStatus.COMPLETED,
            aiFitScore: result.score,
            aiFitDecision: result.decision,
            aiFitSummary: result.summary,
            aiFitReasons: result.reasons,
            aiFitRisks: result.risks,
            aiFitError: null,
          },
        },
        { returnDocument: 'after' },
      ).exec();
    } catch (error: unknown) {
      return TenderCompanyMatchModel.findByIdAndUpdate(
        match._id,
        {
          $set: {
            aiFitStatus: AiFitStatus.FAILED,
            aiFitError: getSafeErrorMessage(error),
          },
        },
        { returnDocument: 'after' },
      ).exec();
    }
  }

  private async setTenderMatchPendingStatus(_id: Types.ObjectId | string) {
    await TenderCompanyMatchModel.updateOne(
      { _id: String(_id) },
      {
        $set: {
          aiFitStatus: AiFitStatus.PENDING,
          aiFitError: null,
        },
      },
    ).exec();
  }

  private async findActiveRecentTenders(): Promise<TenderDocument[]> {
    const publicationDateFrom = new Date();
    publicationDateFrom.setDate(
      publicationDateFrom.getDate() - RECENT_ACTIVE_TENDERS_LOOKBACK_DAYS,
    );

    return TenderModel.find({
      publicationDate: { $gte: publicationDateFrom },
      $or: [
        { submissionDeadline: { $exists: false } },
        { submissionDeadline: null },
        { submissionDeadline: { $gte: new Date() } },
      ],
    }).exec();
  }

  private async findActiveCompetitionTendersBatch(
    lastTenderId?: Types.ObjectId,
  ): Promise<TenderDocument[]> {
    const query: QueryFilter<TenderDocument> = {
      noticeType: { $in: TENDER_COMPETITION_NOTICE_TYPES },
      submissionDeadline: { $gte: new Date() },
    };

    if (lastTenderId) {
      (query as Record<string, unknown>)._id = { $gt: lastTenderId };
    }

    return TenderModel.find(query)
      .sort({ _id: 1 })
      .limit(ACTIVE_COMPETITION_TENDERS_MATCH_BATCH_SIZE)
      .exec();
  }

  private async markMatchedMatchStale(
    tenderId: Types.ObjectId | null,
    companyId: Types.ObjectId,
    staleReason: TenderMatchSource,
  ): Promise<TenderCompanyMatchDocument | null> {
    if (!tenderId) {
      return null;
    }

    return TenderCompanyMatchModel.findOneAndUpdate(
      {
        tender: tenderId,
        company: companyId,
        hardMatchStatus: HardMatchStatus.MATCHED,
      },
      {
        $set: {
          hardMatchStatus: HardMatchStatus.STALE,
          staleReason,
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  private async analyzeCompanyTenderFit(
    payload: CompanyTenderFitAiPayload,
  ): Promise<CompanyTenderFitAiResult> {
    const response =
      await this.deepSeekAnalysisService.createGeneralJsonResponse(
        COMPANY_TENDER_FIT_SYSTEM_PROMPT,
        this.buildCompanyTenderFitUserPrompt(payload),
      );

    return this.validateCompanyTenderFitAiResult(response);
  }

  private buildCompanyTenderFitUserPrompt(
    payload: CompanyTenderFitAiPayload,
  ): string {
    return [
      'Evaluate whether this hard-matched tender should be sent to the user by email.',
      '',
      'Input:',
      JSON.stringify(payload, null, 2),
      '',
      'Return JSON with this exact structure:',
      JSON.stringify(
        {
          score: 75,
          decision: 'good_fit',
          summary: 'string',
          reasons: ['string'],
          risks: ['string'],
          recommendedAction: 'review',
        },
        null,
        2,
      ),
    ].join('\n');
  }

  private validateCompanyTenderFitAiResult(
    value: unknown,
  ): CompanyTenderFitAiResult {
    if (!isRecord(value)) {
      throw new Error('Company tender fit analysis result must be an object');
    }

    const score = value.score;

    if (
      typeof score !== 'number' ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > 100
    ) {
      throw new Error(
        'Company tender fit score must be an integer from 0 to 100',
      );
    }

    return {
      score,
      decision: getAiFitDecision(score),
      summary: getString(value, 'summary'),
      reasons: getStringArray(value, 'reasons'),
      risks: getStringArray(value, 'risks'),
    };
  }

  private async buildCompanyTenderFitPayload(
    tender: TenderDocument,
    filter: CompanyTenderFilterForMatching,
    match: TenderCompanyMatchDocument,
  ): Promise<CompanyTenderFitAiPayload> {
    const companyName = await this.getCompanyName(filter.user);
    const populatedTender = await tender.populate({
      path: 'classificationCpv',
      select: 'code name',
    });

    return {
      company: {
        name: companyName,
        summary: filter.summary,
        targetCountries: filter.targetCountries ?? [],
        languages: filter.languages ?? [],
        capabilities: filter.capabilities ?? [],
        certifications: filter.certifications ?? [],
        publicProcurementExperience: filter.publicProcurementExperience ?? null,
        minBudget: filter.minBudget ?? null,
        maxBudget: filter.maxBudget ?? null,
        currency: filter.currency ?? null,
        cpvCodes: (filter.cpvCodes ?? []).map((cpvCode) => ({
          code: cpvCode.code,
          label: cpvCode.label,
          source: cpvCode.source,
          matchLevel: cpvCode.matchLevel,
        })),
        optionalKeywords: filter.optionalKeywords ?? [],
        requiredKeywords: filter.requiredKeywords ?? [],
      },
      tender: {
        id: tender.id,
        title: tender.title ?? '',
        description: tender.description,
        cpvCodes: readStringArray(populatedTender.classificationCpv),
        buyerName: tender.buyerName,
        buyerCountry: tender.buyerCountry,
        placeOfPerformanceCountries: tender.placeOfPerformanceCountries ?? [],
        estimatedValue: {
          amount: tender.estimatedValue?.amount ?? null,
          currency: tender.estimatedValue?.currency ?? null,
          amountEur: tender.estimatedValueEur,
        },
        deadlineAt: toIsoString(
          tender.submissionDeadline ?? tender.deadlineReceiptTender,
        ),
        publicationDate: toIsoString(tender.publicationDate),
        contractNature: tender.contractNature ?? null,
        procedureType: tender.procedureType ?? null,
        noticeLanguage: tender.noticeLanguage ?? null,
        submissionLanguages: tender.submissionLanguages ?? [],
        selectionCriteria: this.mapSelectionCriteria(tender.selectionCriteria),
        awardCriteria: this.mapAwardCriteria(tender.awardCriteria),
      },
      hardMatch: {
        score: match.hardMatchScore,
        decision: match.decision,
        reasons: match.reasons,
        risks: match.risks,
        keywordHits: match.keywordHits,
      },
    };
  }

  private async getCompanyName(
    companyId: Types.ObjectId | string | null | undefined,
  ): Promise<string | undefined> {
    const company = await UserModel.findById(companyId)
      .select('companyName')
      .lean()
      .exec();

    return readString(company?.companyName);
  }

  private mapSelectionCriteria(
    value: unknown,
  ): CompanyTenderFitAiPayload['tender']['selectionCriteria'] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => ({
      name: isRecord(item) ? (readString(item.name) ?? null) : null,
      description: isRecord(item)
        ? (readString(item.description) ?? null)
        : (readString(item) ?? null),
    }));
  }

  private mapAwardCriteria(
    value: unknown,
  ): CompanyTenderFitAiPayload['tender']['awardCriteria'] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => ({
      name: isRecord(item) ? (readString(item.name) ?? null) : null,
      description: isRecord(item)
        ? (readString(item.description) ?? null)
        : (readString(item) ?? null),
      type: isRecord(item) ? (readString(item.type) ?? null) : null,
      weight: isRecord(item) ? (readNumber(item.weight) ?? null) : null,
    }));
  }

  private async saveMatch(
    tenderId: Types.ObjectId | null,
    companyId: Types.ObjectId,
    filterId: Types.ObjectId | null,
    result: TenderCompanyMatchResult,
  ): Promise<TenderCompanyMatchDocument> {
    if (!tenderId || !filterId) {
      throw new NotFoundException(
        'Tender or company tender filter id is missing',
      );
    }

    const query: QueryFilter<TenderCompanyMatchDocument> = {
      tender: tenderId,
      company: companyId,
    };
    const update: UpdateQuery<TenderCompanyMatchDocument> = {
      $set: {
        tender: tenderId,
        company: companyId,
        companyTenderFilter: filterId,
        hardMatchStatus: result.status,
        hardMatchScore: result.score,
        decision: result.decision,
        reasons: result.reasons,
        risks: result.risks,
        keywordHits: result.keywordHits,
        aiFitStatus: AiFitStatus.NOT_STARTED,
        aiFitScore: null,
        aiFitDecision: null,
        aiFitSummary: '',
        aiFitReasons: [],
        aiFitRisks: [],
        aiFitError: null,
        notificationStatus: NotificationStatus.NOT_CREATED,
      },
      $unset: {
        staleReason: '',
      },
    };

    const savedMatch = await TenderCompanyMatchModel.findOneAndUpdate(
      query,
      update,
      {
        returnDocument: 'after',
        upsert: true,
        includeResultMetadata: false,
      },
    ).exec();

    return savedMatch;
  }
}

function getAiFitDecision(score: number): AiFitDecision {
  if (score >= 85) return AiFitDecision.STRONG_FIT;
  if (score >= 70) return AiFitDecision.GOOD_FIT;
  if (score >= 50) return AiFitDecision.MAYBE;
  return AiFitDecision.REJECT;
}
