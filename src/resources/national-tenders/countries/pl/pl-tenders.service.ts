import { NationalBuyersService } from '@/resources/national-tenders/buyers/national-buyers.service';
import { Injectable, Logger } from '@nestjs/common';
import {
  NationalCollectorRun,
  NationalCollectorStatus,
} from '@/resources/national-tenders/core/national-collector-run';
import { NationalTendersStorageService } from '@/resources/national-tenders/core/national-tenders-storage.service';
import {
  NationalTenderSource,
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

  constructor(
    private readonly bzpClient: BzpClient,
    private readonly bzpNormalizer: BzpNormalizer,
    private readonly bzpUpdateNormalizer: BzpUpdateNormalizer,
    private readonly storage: NationalTendersStorageService,
    private readonly nationalBuyersService: NationalBuyersService,
  ) {}

  getStatus() {
    return {
      recent: this.recentRun.getStatus(),
      backfill: this.backfillRun.getStatus(),
    };
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

    await this.collectWindow(status, from, now, buyers);

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

    await this.collectUpdatesWindow(status, amendmentsFrom, now);
    await this.refreshBuyerStats(status, buyers);
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
    for (let start = now.getTime() - days * DAY_MS; start < now.getTime(); ) {
      const end = Math.min(start + DAY_MS, now.getTime());

      await this.collectUpdatesWindow(status, new Date(start), new Date(end));
      start = end;
    }

    await this.refreshBuyerStats(status, buyers);
  }

  private async collectUpdatesWindow(
    status: NationalCollectorStatus,
    from: Date,
    to: Date,
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
  ) {
    const pages = this.bzpClient.fetchNoticePages({
      noticeType: BzpNoticeType.CONTRACT_NOTICE,
      publicationDateFrom: from,
      publicationDateTo: to,
    });

    for await (const page of pages) {
      status.pagesFetched += 1;
      status.noticesFetched += page.length;

      const normalized = page
        .map((notice) => this.normalizeSafe(notice))
        .filter((tender): tender is NormalizedNationalTender => !!tender);
      const open = normalized.filter((tender) => this.isOpen(tender));
      const result = await this.storage.storeMany(open, {
        generateShortTitles: PL_BZP_CONFIG.generateShortTitles,
        resolveLeadBuyers: async (tender) => {
          const ids = await this.nationalBuyersService.resolveBuyers(
            tender.buyers,
            tender.cpvCodes,
          );

          ids.forEach((id) => buyers.add(id.toString()));

          return ids;
        },
      });

      status.saved += result.saved;
      status.updated += result.updated;
      status.unchanged += result.unchanged;
      status.skipped += normalized.length - open.length;
      status.failed += result.failed + (page.length - normalized.length);

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
