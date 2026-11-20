import { NationalBuyersService } from '@/resources/national-tenders/buyers/national-buyers.service';
import { NationalContractorsService } from '@/resources/national-tenders/contractors/national-contractors.service';
import { NationalAwardsStorageService } from '@/resources/national-tenders/core/national-awards-storage.service';
import { NationalAwardTenderModel } from '@/resources/national-tenders/core/schemas/national-award-tender.schema';
import { BzpResultNormalizer } from './bzp/bzp-result.normalizer';
import { NationalTenderMatchingService } from '@/resources/national-tenders/matching/national-tender-matching.service';
import { Types } from 'mongoose';
import { Injectable, Logger } from '@nestjs/common';
import {
  NationalCollectorRun,
  NationalCollectorStatus,
} from '@/resources/national-tenders/core/national-collector-run';
import { NationalTendersStorageService } from '@/resources/national-tenders/core/national-tenders-storage.service';
import {
  NationalTenderSource,
  NormalizedNationalAward,
  NormalizedNationalTender,
} from '@/resources/national-tenders/core/national-tender.types';
import { NationalTenderModel } from '@/resources/national-tenders/core/schemas/national-tender.schema';
import { PL_BZP_CONFIG } from './pl.config';
import { BzpClient } from './bzp/bzp.client';
import { BzpNormalizer } from './bzp/bzp.normalizer';
import { BzpUpdateNormalizer } from './bzp/bzp-update.normalizer';
import { BzpNotice, BzpNoticeType } from './bzp/bzp.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Poland: collects contract notices from BZP (ezamowienia.gov.pl) into
 * `national_tenders`. Only open tenders (deadline in the future) are kept.
 * Update notices (`NoticeUpdateNotice`) are applied to stored tenders as
 * amendments; the deadline is updated, other changes are kept as text.
 */
@Injectable()
export class PlTendersService {
  private readonly logger = new Logger(PlTendersService.name);
  private readonly recentRun = new NationalCollectorRun('PL_BZP recent');
  private readonly backfillRun = new NationalCollectorRun('PL_BZP backfill');
  private readonly resultsBackfillRun = new NationalCollectorRun(
    'PL_BZP results backfill',
  );
  private readonly matchOpenRun = new NationalCollectorRun('PL_BZP match open');

  constructor(
    private readonly bzpClient: BzpClient,
    private readonly bzpNormalizer: BzpNormalizer,
    private readonly bzpUpdateNormalizer: BzpUpdateNormalizer,
    private readonly bzpResultNormalizer: BzpResultNormalizer,
    private readonly storage: NationalTendersStorageService,
    private readonly awardsStorage: NationalAwardsStorageService,
    private readonly nationalBuyersService: NationalBuyersService,
    private readonly nationalContractorsService: NationalContractorsService,
    private readonly matchingService: NationalTenderMatchingService,
  ) {}

  async getStatus() {
    const source = NationalTenderSource.PL_BZP;
    const [tenders, openTenders, awards] = await Promise.all([
      NationalTenderModel.countDocuments({ source }),
      NationalTenderModel.countDocuments({
        source,
        submissionDeadline: { $gte: new Date() },
      }),
      NationalAwardTenderModel.countDocuments({ source }),
    ]);

    return {
      totals: { tenders, openTenders, awards },
      recent: this.recentRun.getStatus(),
      backfill: this.backfillRun.getStatus(),
      resultsBackfill: this.resultsBackfillRun.getStatus(),
      matchOpen: this.matchOpenRun.getStatus(),
    };
  }

  /**
   * Matches all open tenders with company filters (initial run after a
   * backfill; the daily run matches only new and changed tenders).
   */
  startMatchOpen() {
    return this.matchOpenRun.start(async (status) => {
      status.stage = 'matching';
      status.matching = await this.matchingService.matchOpen(
        NationalTenderSource.PL_BZP,
      );
      status.stage = 'reports';
      await this.matchingService.sendInstantReports();
    });
  }

  /** Starts the recent run in background; returns its status. */
  startRecent() {
    return this.recentRun.start((status) => this.collectRecent(status));
  }

  /** Runs the recent collection and waits for it (used by cron). */
  runRecent() {
    return this.recentRun.run((status) => this.collectRecent(status));
  }

  /** Starts a backfill of open tenders published in the last `days` days. */
  startBackfill(days = PL_BZP_CONFIG.backfillDays) {
    return this.backfillRun.start((status) =>
      this.collectBackfill(status, days),
    );
  }

  /** Re-normalizes a stored tender from its raw notice, without saving. */
  async renormalize(id: string) {
    const tender = await this.storage.findById(id, true).lean();

    return tender?.rawData
      ? this.bzpNormalizer.normalize(tender.rawData as BzpNotice)
      : null;
  }

  private async collectRecent(status: NationalCollectorStatus) {
    const latest = await NationalTenderModel.findOne({
      source: NationalTenderSource.PL_BZP,
    })
      .sort({ publicationDate: -1 })
      .select('publicationDate')
      .lean();
    const now = new Date();
    const from = latest?.publicationDate
      ? new Date(
          latest.publicationDate.getTime() - PL_BZP_CONFIG.recentOverlapMs,
        )
      : new Date(now.getTime() - PL_BZP_CONFIG.recentDefaultLookbackMs);

    const buyers = new Set<string>();
    const changed: Types.ObjectId[] = [];
    const amended = new Set<string>();

    await this.collectWindow(status, from, now, buyers, changed);

    // Updates go after contract notices so a tender and its first amendment
    // can arrive in the same run.
    const latestAmendment = await this.storage.findLatestAmendmentDate(
      NationalTenderSource.PL_BZP,
    );
    const amendmentsFrom = new Date(
      Math.max(
        (latestAmendment?.getTime() ?? 0) - PL_BZP_CONFIG.recentOverlapMs,
        now.getTime() - PL_BZP_CONFIG.updatesMaxLookbackMs,
      ),
    );

    status.stage = 'amendments';
    await this.collectUpdatesWindow(status, amendmentsFrom, now, amended);

    // Results (winners, contract values) of any procedure, not only stored ones.
    const contractors = new Set<string>();
    const latestAward = await NationalAwardTenderModel.findOne({
      source: NationalTenderSource.PL_BZP,
    })
      .sort({ publicationDate: -1 })
      .select('publicationDate')
      .lean();
    const resultsFrom = new Date(
      Math.max(
        (latestAward?.publicationDate?.getTime() ?? 0) -
          PL_BZP_CONFIG.recentOverlapMs,
        now.getTime() - PL_BZP_CONFIG.resultsMaxLookbackMs,
      ),
    );

    status.stage = 'results';
    await this.collectResultsWindow(
      status,
      resultsFrom,
      now,
      buyers,
      contractors,
    );
    status.stage = 'stats';
    await this.refreshBuyerStats(status, buyers);
    await this.refreshContractorStats(status, contractors);

    // Same flow as TED: match new/changed tenders, then instant reports
    // (daily/weekly reports pick the matches up on their own schedule).
    status.stage = 'matching';
    status.matching = await this.matchingService.matchChanged(
      NationalTenderSource.PL_BZP,
      changed,
      amended,
    );
    status.stage = 'reports';
    await this.matchingService.sendInstantReports();
  }

  /** Starts a backfill of results only (winners, contracts) for `days` days. */
  startResultsBackfill(days = PL_BZP_CONFIG.backfillDays) {
    return this.resultsBackfillRun.start(async (status) => {
      const now = new Date();
      const buyers = new Set<string>();
      const contractors = new Set<string>();

      status.stage = 'results';
      for (let start = now.getTime() - days * DAY_MS; start < now.getTime(); ) {
        const end = Math.min(start + DAY_MS, now.getTime());

        await this.collectResultsWindow(
          status,
          new Date(start),
          new Date(end),
          buyers,
          contractors,
        );
        start = end;
      }

      status.stage = 'stats';
      await this.refreshBuyerStats(status, buyers);
      await this.refreshContractorStats(status, contractors);
    });
  }

  private async refreshContractorStats(
    status: NationalCollectorStatus,
    contractors: Set<string>,
  ) {
    status.contractorsTouched = contractors.size;
    await this.nationalContractorsService.refreshStats([...contractors]);
  }

  private async collectResultsWindow(
    status: NationalCollectorStatus,
    from: Date,
    to: Date,
    buyers: Set<string>,
    contractors: Set<string>,
  ) {
    const stats = status.awards;
    const pages = this.bzpClient.fetchNoticePages({
      noticeType: BzpNoticeType.TENDER_RESULT_NOTICE,
      publicationDateFrom: from,
      publicationDateTo: to,
    });

    for await (const page of pages) {
      status.pagesFetched += 1;
      stats.fetched += page.length;

      const awards = page
        .map((notice) => {
          try {
            return this.bzpResultNormalizer.normalize(notice);
          } catch (e: unknown) {
            this.logger.warn(
              `Failed to normalize BZP result ${notice.bzpNumber}: ${
                e instanceof Error ? e.message : 'unknown error'
              }`,
            );
            return undefined;
          }
        })
        .filter((award): award is NormalizedNationalAward => !!award);
      stats.failed += page.length - awards.length;

      await this.awardsStorage.storeMany(awards, {
        onStored: (outcome) => {
          stats[outcome] += 1;
        },
        resolveLeadBuyers: async (award) => {
          const ids = await this.nationalBuyersService.resolveBuyers(
            award.buyers,
            award.cpvCodes,
          );

          ids.forEach((id) => buyers.add(id.toString()));

          return ids;
        },
        resolveWinners: async (award) => {
          const ids =
            await this.nationalContractorsService.resolveWinners(award);

          ids.forEach((id) => id && contractors.add(id.toString()));

          return ids;
        },
      });
    }
  }

  /** One-off migration of tenders stored with inline buyers. */
  migrateInlineBuyers() {
    return this.nationalBuyersService.migrateInlineBuyers(
      NationalTenderSource.PL_BZP,
    );
  }

  private async refreshBuyerStats(
    status: NationalCollectorStatus,
    buyers: Set<string>,
  ) {
    status.buyersTouched = buyers.size;
    await this.nationalBuyersService.refreshStats([...buyers]);
  }

  private async collectBackfill(status: NationalCollectorStatus, days: number) {
    const now = new Date();
    const buyers = new Set<string>();

    // One-day windows keep each query small and let progress show in status.
    for (let start = now.getTime() - days * DAY_MS; start < now.getTime(); ) {
      const end = Math.min(start + DAY_MS, now.getTime());

      await this.collectWindow(status, new Date(start), new Date(end), buyers);
      start = end;
    }

    // Amendments last: they need the amended tenders to be stored already.
    status.stage = 'amendments';
    for (let start = now.getTime() - days * DAY_MS; start < now.getTime(); ) {
      const end = Math.min(start + DAY_MS, now.getTime());

      await this.collectUpdatesWindow(status, new Date(start), new Date(end));
      start = end;
    }

    const contractors = new Set<string>();

    status.stage = 'results';
    for (let start = now.getTime() - days * DAY_MS; start < now.getTime(); ) {
      const end = Math.min(start + DAY_MS, now.getTime());

      await this.collectResultsWindow(
        status,
        new Date(start),
        new Date(end),
        buyers,
        contractors,
      );
      start = end;
    }

    status.stage = 'stats';
    await this.refreshBuyerStats(status, buyers);
    await this.refreshContractorStats(status, contractors);
  }

  private async collectUpdatesWindow(
    status: NationalCollectorStatus,
    from: Date,
    to: Date,
    amended?: Set<string>,
  ) {
    const stats = status.amendments;
    const pages = this.bzpClient.fetchNoticePages({
      noticeType: BzpNoticeType.NOTICE_UPDATE_NOTICE,
      publicationDateFrom: from,
      publicationDateTo: to,
    });

    for await (const page of pages) {
      status.pagesFetched += 1;
      stats.fetched += page.length;

      for (const notice of page) {
        try {
          const normalized = this.bzpUpdateNormalizer.normalize(notice);

          if (!normalized) {
            stats.ignored += 1;
            continue;
          }

          const result = await this.storage.applyAmendment(
            normalized.source,
            normalized.tenderSourceId,
            normalized.amendment,
          );

          stats[result] += 1;

          if (result === 'applied') {
            amended?.add(normalized.tenderSourceId);
          }
        } catch (e: unknown) {
          stats.failed += 1;
          this.logger.warn(
            `Failed to apply BZP update ${notice.bzpNumber}: ${
              e instanceof Error ? e.message : 'unknown error'
            }`,
          );
        }
      }
    }
  }

  private async collectWindow(
    status: NationalCollectorStatus,
    from: Date,
    to: Date,
    buyers: Set<string>,
    changed?: Types.ObjectId[],
  ) {
    status.stage = 'tenders';
    const pages = this.bzpClient.fetchNoticePages({
      noticeType: BzpNoticeType.CONTRACT_NOTICE,
      publicationDateFrom: from,
      publicationDateTo: to,
    });

    for await (const page of pages) {
      status.stage = 'tenders';
      status.pagesFetched += 1;
      status.noticesFetched += page.length;

      const normalized = page
        .map((notice) => this.normalizeSafe(notice))
        .filter((tender): tender is NormalizedNationalTender => !!tender);
      const open = normalized.filter((tender) => this.isOpen(tender));

      status.skipped += normalized.length - open.length;
      status.failed += page.length - normalized.length;

      await this.storage.storeMany(open, {
        generateShortTitles: PL_BZP_CONFIG.generateShortTitles,
        onStored: (outcome) => {
          status[outcome] += 1;
        },
        onShortTitlesStart: () => {
          status.stage = 'shortTitles';
        },
        onShortTitlesGenerated: (count) => {
          status.shortTitlesGenerated += count;
        },
        resolveLeadBuyers: async (tender) => {
          const ids = await this.nationalBuyersService.resolveBuyers(
            tender.buyers,
            tender.cpvCodes,
          );

          ids.forEach((id) => buyers.add(id.toString()));

          return ids;
        },
        onChanged: (id) => changed?.push(id),
      });

      const lastPublication = page[page.length - 1]?.publicationDate;

      if (lastPublication) {
        status.lastPublicationDate = new Date(lastPublication);
      }
    }
  }

  private normalizeSafe(notice: BzpNotice) {
    try {
      return this.bzpNormalizer.normalize(notice);
    } catch (e: unknown) {
      this.logger.warn(
        `Failed to normalize BZP notice ${notice.bzpNumber}: ${
          e instanceof Error ? e.message : 'unknown error'
        }`,
      );
      return undefined;
    }
  }

  private isOpen(tender: NormalizedNationalTender): boolean {
    return (
      !tender.submissionDeadline ||
      tender.submissionDeadline.getTime() >= Date.now()
    );
  }
}
