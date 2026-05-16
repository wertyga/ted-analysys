import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryFilter, Types, UpdateQuery } from 'mongoose';
import { CompanyTenderFilterModel } from '@/resources/company-filter/company-filter.schema';
import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import { toObjectId } from '@/utils';
import { mapTenderForMatching } from './tender-for-matching.mapper';
import { matchTenderWithCompanyFilter } from './tender-match-rules';
import {
  AiFitStatus,
  CompanyTenderFilterForMatching,
  HardMatchStatus,
  NotificationStatus,
  TenderCompanyMatchResult,
} from './tender-match.types';
import {
  TenderCompanyMatch,
  TenderCompanyMatchDocument,
  TenderCompanyMatchModel,
} from './schemas/tender-company-match.schema';
import * as fs from 'node:fs';

const RECENT_ACTIVE_TENDERS_LOOKBACK_DAYS = 2;

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
  ): Promise<TenderCompanyMatchDocument[]> {
    const companyId = toObjectId(filter.user);

    if (!companyId) {
      return [];
    }

    const tenders = await this.findActiveRecentTenders();
    const matches = await Promise.all(
      tenders.map((tender) =>
        this.matchTenderWithCompanyFilter(tender, filter, companyId),
      ),
    );

    return matches.filter(Boolean) as TenderCompanyMatchDocument[];
  }

  async matchTenderWithAllCompanyFilters(
    tender: TenderDocument,
  ): Promise<TenderCompanyMatchDocument[]> {
    const companyFilters = await CompanyTenderFilterModel.find({
      confirmedByUser: true,
    }).exec();

    return this.matchTenderWithFilters(tender, companyFilters);
  }

  private async matchTenderWithFilters(
    tender: TenderDocument,
    companyFilters: CompanyTenderFilterForMatching[],
  ): Promise<TenderCompanyMatchDocument[]> {
    const matches = await Promise.all(
      companyFilters.map((filter) =>
        this.matchTenderWithCompanyFilter(tender, filter),
      ),
    );

    return matches.filter(Boolean) as TenderCompanyMatchDocument[];
  }

  private async matchTenderWithCompanyFilter(
    tender: TenderDocument,
    filter: CompanyTenderFilterForMatching,
    resolvedCompanyId?: Types.ObjectId,
  ): Promise<TenderCompanyMatchDocument | undefined> {
    const companyId = resolvedCompanyId ?? toObjectId(filter.user);

    if (!companyId) {
      return undefined;
    }

    const result = this.matchTenderWithFilter(tender, filter);
    const tenderId = toObjectId(tender._id);
    const filterId = toObjectId(filter._id);

    if (result.status !== HardMatchStatus.MATCHED) {
      await this.deleteMatch(tenderId, companyId);
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

  private async deleteMatch(
    tenderId: Types.ObjectId | null,
    companyId: Types.ObjectId,
  ): Promise<TenderCompanyMatchDocument | null> {
    if (!tenderId) {
      return null;
    }

    return TenderCompanyMatchModel.findOneAndDelete({
      tender: tenderId,
      company: companyId,
    }).exec();
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
