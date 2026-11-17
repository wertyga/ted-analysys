import { Logger } from '@nestjs/common';
import { logger } from '@/utils';
import { NationalTenderStoreResult } from './national-tender.types';

export interface NationalCollectorStatus extends NationalTenderStoreResult {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  pagesFetched: number;
  noticesFetched: number;
  /** Notices skipped on purpose (e.g. deadline already passed). */
  skipped: number;
  /** Publication date of the newest notice processed in the last run. */
  lastPublicationDate: Date | null;
  /** Amendment notices (deadline changes etc.). */
  amendments: NationalAmendmentStats;
  /** Shared `buyers` records created/updated in this run. */
  buyersTouched: number;
}

export interface NationalAmendmentStats {
  fetched: number;
  applied: number;
  /** Already applied earlier. */
  duplicate: number;
  /** Amended tender is not stored (expired when collected, or older). */
  notFound: number;
  /** Amendments of notices we do not store (results, contracts, ...). */
  ignored: number;
  failed: number;
}

const emptyStatus = (): NationalCollectorStatus => ({
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  pagesFetched: 0,
  noticesFetched: 0,
  skipped: 0,
  lastPublicationDate: null,
  buyersTouched: 0,
  amendments: {
    fetched: 0,
    applied: 0,
    duplicate: 0,
    notFound: 0,
    ignored: 0,
    failed: 0,
  },
  saved: 0,
  updated: 0,
  unchanged: 0,
  failed: 0,
});

/**
 * Single-flight runner with status for one collector job
 * (one per source and job kind, e.g. "PL_BZP recent").
 */
export class NationalCollectorRun {
  private status = emptyStatus();
  private readonly logger: Logger;

  constructor(private readonly name: string) {
    this.logger = new Logger(name);
  }

  getStatus(): NationalCollectorStatus {
    return { ...this.status, amendments: { ...this.status.amendments } };
  }

  /** Starts the job in background and returns the current status. */
  start(job: (status: NationalCollectorStatus) => Promise<void>) {
    if (!this.status.isRunning) {
      void this.run(job);
    }

    return this.getStatus();
  }

  async run(job: (status: NationalCollectorStatus) => Promise<void>) {
    if (this.status.isRunning) {
      this.logger.warn(`${this.name} is already running, skipping`);
      return;
    }

    this.status = { ...emptyStatus(), isRunning: true, startedAt: new Date() };
    const status = this.status;

    try {
      await job(status);
      this.logger.log(
        `${this.name} done: fetched=${status.noticesFetched} saved=${status.saved} updated=${status.updated} unchanged=${status.unchanged} skipped=${status.skipped} failed=${status.failed} amendments=${JSON.stringify(status.amendments)}`,
      );
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'unknown error';

      status.lastError = error;
      this.logger.error(
        `${this.name} failed: ${error}`,
        e instanceof Error ? e.stack : undefined,
      );
      await logger.error(`NATIONAL_COLLECTOR_FAILED ${this.name}`, error);
    } finally {
      status.isRunning = false;
      status.finishedAt = new Date();
    }
  }
}
