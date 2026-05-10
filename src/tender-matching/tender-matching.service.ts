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
  NotificationStatus,
  TenderCompanyMatchResult,
} from './tender-match.types';
import {
  TenderCompanyMatch,
  TenderCompanyMatchDocument,
  TenderCompanyMatchModel,
} from './schemas/tender-company-match.schema';

@Injectable()
export class TenderMatchingService {
  matchTenderWithFilter(
    tender: TenderDocument,
    filter: CompanyTenderFilterForMatching,
  ): TenderCompanyMatchResult {
    return matchTenderWithCompanyFilter(mapTenderForMatching(tender), filter);
  }

  async processTender(tenderId: string): Promise<void> {
    const [tender, companyFilters] = await Promise.all([
      this.findTender(tenderId),
      CompanyTenderFilterModel.find({ confirmedByUser: true }),
    ]);

    await Promise.all(
      companyFilters.map(async (filter) => {
        const companyId = toObjectId(filter.user);

        if (!companyId) {
          return;
        }

        const result = this.matchTenderWithFilter(tender, filter);

        return this.saveMatch(
          toObjectId(tender._id),
          companyId,
          toObjectId(filter._id),
          result,
          filter,
        );
      }),
    );
  }

  async processTenderForCompany(
    tenderId: string,
    companyId: string,
  ): Promise<TenderCompanyMatch> {
    const tender = await this.findTender(tenderId);
    const companyObjectId = toObjectId(companyId);

    if (!companyObjectId) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    const filter = await CompanyTenderFilterModel.findOne({
      confirmedByUser: true,
      user: companyObjectId,
    }).exec();

    if (!filter) {
      throw new NotFoundException(
        `Confirmed company tender filter for company ${companyId} not found`,
      );
    }

    const result = this.matchTenderWithFilter(tender, filter);

    return this.saveMatch(
      toObjectId(tender._id),
      companyObjectId,
      toObjectId(filter._id),
      result,
      filter,
    );
  }

  private async findTender(tenderId: string): Promise<TenderDocument> {
    const objectId = toObjectId(tenderId);
    const query = {
      $or: [
        ...(objectId ? [{ _id: objectId }] : []),
        { id: tenderId },
        { publicationNumber: tenderId },
      ],
    } as unknown as QueryFilter<TenderDocument>;

    const tender = await TenderModel.findOne(query).exec();

    if (!tender) {
      throw new NotFoundException(`Tender ${tenderId} not found`);
    }

    return tender;
  }

  private async saveMatch(
    tenderId: Types.ObjectId | null,
    companyId: Types.ObjectId,
    filterId: Types.ObjectId | null,
    result: TenderCompanyMatchResult,
    filter: CompanyTenderFilterForMatching,
  ): Promise<TenderCompanyMatchDocument> {
    if (!tenderId || !filterId) {
      throw new NotFoundException(
        'Tender or company tender filter id is missing',
      );
    }

    if (result.matched && result.score >= filter.notificationThreshold) {
      // TODO: enqueue basic AI analysis or create notification
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
