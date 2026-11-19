import { Injectable, NotFoundException } from '@nestjs/common';
import { PopulateOptions, QueryFilter, Types, UpdateQuery } from 'mongoose';
import { CompanyTenderFilterModel } from '@/resources/company-filter/company-filter.schema';
import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import {
  getSafeErrorMessage,
  getPaginationMeta,
  getString,
  getStringArray,
  isRecord,
  DebouncedAsyncLatestQueueByKey,
  logger,
  QueueAsyncConcurrency,
  readString,
  readStringArray,
  toObjectId,
  toIsoString,
  // tenderCpvPopulateFields,
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
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import { COMPANY_TENDER_FIT_SYSTEM_PROMPT } from './company-tender-fit.prompt';
import { UserModel } from '@/resources/user/user.schema';
import { TariffService } from '@/resources/tariff';
import { TENDER_MATCHING_CONFIG } from '@/config/tender-matching.config';
import { BuyerDocument } from '@/resources/buyer/schemas';
import { buildCompanyTenderFitUserPrompt } from './tender-matching.prompt';
import { CpvService } from '@/resources/cpv/cpv.service';
import { getTenderModelName } from '@/resources/national-tenders/core/national-tender.serializer';
import { NationalTenderModel } from '@/resources/national-tenders/core/schemas/national-tender.schema';

/**
 * Populate of a match's polymorphic `tender`: TED tenders have
 * `nonLeadBuyers`, national tenders only `leadBuyers`.
 */
export const MATCH_TENDER_POPULATE: PopulateOptions = {
  path: 'tender',
  populate: [
    { path: 'leadBuyers' },
    { path: 'nonLeadBuyers', strictPopulate: false },
  ],
};

@Injectable()
export class TenderMatchingService {
  private readonly companyTenderAiFitQueue = new QueueAsyncConcurrency(
    TENDER_MATCHING_CONFIG.companyTenderAiFit.concurrency,
  );
  private readonly companyProfileRematches: DebouncedAsyncLatestQueueByKey<
    string,
    CompanyTenderFilterForMatching,
    TenderCompanyMatchDocument[]
  >;

  constructor(
    private readonly llmAnalysisService: LlmAnalysisService,
    private readonly tariffService: TariffService,
    private readonly cpvService: CpvService,
  ) {
    this.companyProfileRematches = new DebouncedAsyncLatestQueueByKey({
      delayMs: TENDER_MATCHING_CONFIG.companyProfileRematch.debounceMs,
      concurrency: TENDER_MATCHING_CONFIG.companyProfileRematch.concurrency,
      runner: (filter) =>
        this.rematchActiveCompetitionTendersWithCompanyFilter(filter),
    });
  }

  matchTenderWithFilter(
    tender: TenderDocument,
    filter: CompanyTenderFilterForMatching,
  ): TenderCompanyMatchResult {
    return matchTenderWithCompanyFilter(mapTenderForMatching(tender), filter);
  }

  getAiFitMatchesQuery(
    companyId: Types.ObjectId | string,
    minAiFitScore = 65,
  ): QueryFilter<TenderCompanyMatchDocument> {
    return {
      company: companyId,
      hardMatchStatus: HardMatchStatus.MATCHED,
      aiFitStatus: AiFitStatus.COMPLETED,
      aiFitScore: { $gte: minAiFitScore },
    };
  }

  async findCompletedAiFitMatchesForUser(
    companyId: Types.ObjectId | string,
    minAiFitScore = 65,
    pagination: { page?: number; limit?: number } = {},
  ): Promise<{
    items: TenderCompanyMatchDocument[];
    total: number;
  }> {
    const { limit, skip } = getPaginationMeta(pagination);

    if (!companyId) {
      return { items: [], total: 0 };
    }

    const query = this.getAiFitMatchesQuery(companyId, minAiFitScore);

    const [items, total] = await Promise.all([
      TenderCompanyMatchModel.find(query)
        .sort({ aiFitScore: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(MATCH_TENDER_POPULATE)
        .exec(),
      TenderCompanyMatchModel.countDocuments(query).exec(),
    ]);

    return {
      items,
      total,
    };
  }

  async rematchActiveCompetitionTendersAfterCompanyProfileUpdated(
    filter: CompanyTenderFilterForMatching,
  ): Promise<TenderCompanyMatchDocument[]> {
    const companyId = toObjectId(filter.user);

    if (!companyId) {
      return [];
    }

    const companyKey = String(companyId);

    return this.companyProfileRematches.run(companyKey, filter);
  }

  async waitForTenderCompanyAiFitQueueIdle(): Promise<void> {
    await this.companyTenderAiFitQueue.onIdle();
  }

  private async rematchActiveCompetitionTendersWithCompanyFilter(
    filter: CompanyTenderFilterForMatching,
  ): Promise<TenderCompanyMatchDocument[]> {
    const savedMatches: TenderCompanyMatchDocument[] = [];

    for (const findBatch of [
      (lastId?: Types.ObjectId) => this.findActiveCompetitionTendersBatch(lastId),
      (lastId?: Types.ObjectId) =>
        this.findActiveNationalTendersBatch(lastId),
    ]) {
      savedMatches.push(
        ...(await this.rematchTendersBatched(filter, findBatch)),
      );
    }

    return savedMatches;
  }

  private async rematchTendersBatched(
    filter: CompanyTenderFilterForMatching,
    findBatch: (lastTenderId?: Types.ObjectId) => Promise<TenderDocument[]>,
  ): Promise<TenderCompanyMatchDocument[]> {
    const savedMatches: TenderCompanyMatchDocument[] = [];
    let lastTenderId: Types.ObjectId | undefined;

    while (true) {
      const tenders = await findBatch(lastTenderId);

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
    const companyFilters = await CompanyTenderFilterModel.find({});

    return this.matchTenderWithFilters(tender, companyFilters, source);
  }

  /**
   * Matches national tenders (by `_id`) with all company filters. Field names
   * of national tenders mirror `Tender`, so the same rules and AI-fit apply;
   * matches are stored in `tender_company_matches` with `tenderModel`.
   */
  async matchNationalTendersWithAllCompanyFilters(
    tenderIds: Types.ObjectId[],
    source: TenderMatchSource,
  ): Promise<TenderCompanyMatchDocument[]> {
    if (tenderIds.length === 0) {
      return [];
    }

    const companyFilters = await CompanyTenderFilterModel.find({});

    if (companyFilters.length === 0) {
      return [];
    }

    const savedMatches: TenderCompanyMatchDocument[] = [];
    const batchSize = TENDER_MATCHING_CONFIG.activeCompetitionTendersMatchBatchSize;

    for (let i = 0; i < tenderIds.length; i += batchSize) {
      const tenders = await this.findNationalTendersForMatching({
        _id: { $in: tenderIds.slice(i, i + batchSize) },
      });

      for (const tender of tenders) {
        savedMatches.push(
          ...(await this.matchTenderWithFilters(tender, companyFilters, source)),
        );
      }
    }

    return savedMatches;
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

    if (!(await this.isTenderMatchingEnabled(companyId))) {
      return undefined;
    }

    const result = this.matchTenderWithFilter(tender, filter);
    const tenderId = toObjectId(tender._id);
    const filterId = toObjectId(filter._id);

    if (result.status !== HardMatchStatus.MATCHED) {
      await this.markMatchedMatchStale(tenderId, companyId, source, result);

      return undefined;
    }

    const savedMatch = await this.saveMatch(
      tenderId,
      getTenderModelName(tender.id ?? ''),
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

      const updatedMatch = await TenderCompanyMatchModel.findByIdAndUpdate(
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

      return updatedMatch;
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
      .limit(TENDER_MATCHING_CONFIG.activeCompetitionTendersMatchBatchSize)
      .exec();
  }

  /** Open national tenders, same order/batching as TED competition tenders. */
  private async findActiveNationalTendersBatch(
    lastTenderId?: Types.ObjectId,
  ): Promise<TenderDocument[]> {
    return this.findNationalTendersForMatching(
      {
        noticeType: { $in: TENDER_COMPETITION_NOTICE_TYPES },
        submissionDeadline: { $gte: new Date() },
        ...(lastTenderId ? { _id: { $gt: lastTenderId } } : {}),
      },
      TENDER_MATCHING_CONFIG.activeCompetitionTendersMatchBatchSize,
    );
  }

  /** National tenders with populated buyers, typed as TED tenders for rules. */
  private async findNationalTendersForMatching(
    query: Record<string, unknown>,
    limit?: number,
  ): Promise<TenderDocument[]> {
    const find = NationalTenderModel.find(query)
      .sort({ _id: 1 })
      .populate('leadBuyers');

    if (limit) {
      find.limit(limit);
    }

    return (await find.exec()) as unknown as TenderDocument[];
  }

  private async markMatchedMatchStale(
    tenderId: Types.ObjectId | null,
    companyId: Types.ObjectId,
    staleReason: TenderMatchSource,
    result: TenderCompanyMatchResult,
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
          staleExplanation: buildStaleExplanation(result),
          staleReasons: result.reasons,
          staleRisks: result.risks,
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  private async analyzeCompanyTenderFit(
    payload: CompanyTenderFitAiPayload,
  ): Promise<CompanyTenderFitAiResult> {
    const response = await this.llmAnalysisService.createGeneralJsonResponse(
      COMPANY_TENDER_FIT_SYSTEM_PROMPT,
      buildCompanyTenderFitUserPrompt(payload),
    );

    return this.validateCompanyTenderFitAiResult(response);
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
    const cpvLabelsByCode = await this.resolveCpvCodeLabels([
      ...(tender.cpvCodes ?? []),
      ...(filter.cpvCodes ?? []).map((cpvCode) => cpvCode.code),
    ]);

    return {
      hardMatch: {
        score: match.hardMatchScore,
        decision: match.decision,
        reasons: match.reasons ?? [],
        risks: match.risks ?? [],
        keywordHits: match.keywordHits ?? [],
      },
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
        cpvCodes: (filter.cpvCodes ?? []).map((cpvCode) => {
          const code = this.normalizeCpvCode(cpvCode.code);

          return {
            code: cpvCode.code,
            label: cpvCode.label || cpvLabelsByCode.get(code),
            source: cpvCode.source,
            matchLevel: cpvCode.matchLevel,
          };
        }),
        optionalKeywords: filter.optionalKeywords ?? [],
        requiredKeywords: filter.requiredKeywords ?? [],
      },
      tender: {
        id: tender.id,
        title: tender.title ?? '',
        description: tender.description,
        cpvCodes: (tender.cpvCodes ?? []).map((code) => {
          const normalizedCode = this.normalizeCpvCode(code);

          return {
            code,
            label: cpvLabelsByCode.get(normalizedCode),
          };
        }),
        buyers: tender.leadBuyers as BuyerDocument[],
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

  private async resolveCpvCodeLabels(
    codes: string[],
  ): Promise<Map<string, string>> {
    const normalizedCodes = Array.from(
      new Set(codes.map((code) => this.normalizeCpvCode(code)).filter(Boolean)),
    );
    const labelsByCode = new Map<string, string>();

    if (normalizedCodes.length === 0) {
      return labelsByCode;
    }

    const dbCategories = await this.cpvService.resolveCpvCodeIds(
      normalizedCodes,
      true,
    );

    for (const category of dbCategories) {
      labelsByCode.set(category.code, category.name);
    }

    for (const rawCode of this.cpvService.resolveRawCodes(normalizedCodes)) {
      if (!labelsByCode.has(rawCode.code)) {
        labelsByCode.set(rawCode.code, rawCode.name);
      }
    }

    return labelsByCode;
  }

  private normalizeCpvCode(code: string | null | undefined): string {
    return readString(code)?.replace(/\D/g, '').slice(0, 8) ?? '';
  }

  private async isTenderMatchingEnabled(
    companyId: Types.ObjectId,
  ): Promise<boolean> {
    const company = await UserModel.findById(companyId).select('_id').exec();

    if (!company) {
      return false;
    }

    const tariff = await this.tariffService.getUserTariff(company);

    return tariff.rules.tenderMatching.enabled;
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

  private async saveMatch(
    tenderId: Types.ObjectId | null,
    tenderModel: string,
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
        tenderModel,
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
        staleExplanation: '',
        staleReasons: '',
        staleRisks: '',
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

function buildStaleExplanation(result: TenderCompanyMatchResult): string {
  const reason = result.reasons[0];

  if (reason) {
    return reason;
  }

  return `Hard match score below threshold: ${result.score}`;
}

function getAiFitDecision(score: number): AiFitDecision {
  if (score >= 85) return AiFitDecision.STRONG_FIT;
  if (score >= 70) return AiFitDecision.GOOD_FIT;
  if (score >= 50) return AiFitDecision.MAYBE;
  return AiFitDecision.REJECT;
}
