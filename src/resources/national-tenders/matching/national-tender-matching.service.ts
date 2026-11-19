import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenderMatchingService } from '@/resources/tender-matching/tender-matching.service';
import { TenderMatchSource } from '@/resources/tender-matching/tender-match.types';
import { TenderMatchNotificationsService } from '@/resources/tender-match-notifications/tender-match-notifications.service';
import { TENDER_COMPETITION_NOTICE_TYPES } from '@/resources/ted-search/utils/niticies';
import { NationalTenderSource } from '../core/national-tender.types';
import { NationalTenderModel } from '../core/schemas/national-tender.schema';

export interface NationalMatchingStats {
  tendersMatched: number;
  matchesSaved: number;
}

/**
 * Company matching for national tenders, shared by all countries.
 *
 * Rules, AI-fit and notifications are the TED ones: matches are stored in the
 * common `tender_company_matches` (polymorphic `tenderModel`), so the user
 * gets one list in the dashboard and one email for TED and national tenders.
 */
@Injectable()
export class NationalTenderMatchingService {
  private readonly logger = new Logger(NationalTenderMatchingService.name);

  constructor(
    private readonly tenderMatchingService: TenderMatchingService,
    private readonly tenderMatchNotificationsService: TenderMatchNotificationsService,
  ) {}

  /** Matches saved/changed tenders and amended tenders (by source id). */
  async matchChanged(
    source: NationalTenderSource,
    changedIds: Iterable<Types.ObjectId>,
    amendedSourceIds: Iterable<string> = [],
  ): Promise<NationalMatchingStats> {
    const ids = new Map<string, Types.ObjectId>();

    for (const id of changedIds) {
      ids.set(id.toString(), id);
    }

    const amended = [...amendedSourceIds];

    if (amended.length > 0) {
      const records = await NationalTenderModel.find({
        source,
        sourceId: { $in: amended },
      })
        .select('_id')
        .lean();

      records.forEach(({ _id }) => ids.set(_id.toString(), _id));
    }

    return this.match([...ids.values()]);
  }

  /** Matches every open tender of the source (initial run / after rule changes). */
  async matchOpen(source: NationalTenderSource): Promise<NationalMatchingStats> {
    const records = await NationalTenderModel.find({
      source,
      noticeType: { $in: TENDER_COMPETITION_NOTICE_TYPES },
      submissionDeadline: { $gte: new Date() },
    })
      .select('_id')
      .lean();

    return this.match(records.map(({ _id }) => _id));
  }

  /** Waits for AI-fit of the new matches, then sends instant reports. */
  async sendInstantReports(): Promise<void> {
    await this.tenderMatchingService.waitForTenderCompanyAiFitQueueIdle();
    await this.tenderMatchNotificationsService.sendInstantReports();
  }

  private async match(ids: Types.ObjectId[]): Promise<NationalMatchingStats> {
    const matches =
      await this.tenderMatchingService.matchNationalTendersWithAllCompanyFilters(
        ids,
        TenderMatchSource.TENDER_UPDATED,
      );

    this.logger.log(
      `National tenders matched: tenders=${ids.length} matches=${matches.length}`,
    );

    return { tendersMatched: ids.length, matchesSaved: matches.length };
  }
}
