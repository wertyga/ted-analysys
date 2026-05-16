import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryFilter, Types, UpdateQuery } from 'mongoose';
import { CompanyTenderFilterModel } from '@/resources/company-filter/company-filter.schema';
import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import { toObjectId } from '@/utils';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { mapTenderForMatching } from './tender-for-matching.mapper';
import { matchTenderWithCompanyFilter } from './tender-match-rules';
import {
  AiFitStatus,
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

const RECENT_ACTIVE_TENDERS_LOOKBACK_DAYS = 2;
const ACTIVE_COMPETITION_TENDERS_MATCH_BATCH_SIZE = 100;

@Injectable()
export class TenderMatchingService {
  matchTenderWithFilter(
    tender: TenderDocument,
    filter: CompanyTenderFilterForMatching,
  ): TenderCompanyMatchResult {
    return matchTenderWithCompanyFilter(mapTenderForMatching(tender), filter);
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
    console.log('rematchActiveCompetitionTendersAfterCompanyProfileUpdated');
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
      console.log({ matches });
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

    return savedMatch;
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
