import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { PL_BZP_CONFIG } from '../pl.config';
import { BzpNotice, BzpNoticeQuery } from './bzp.types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Formats a date the way the BZP API expects (`YYYY-MM-DDTHH:mm:ss`, UTC). */
export const toBzpDate = (date: Date) => date.toISOString().slice(0, 19);

/**
 * Client for the public BZP notice API.
 * Pages with the `SearchAfter=<objectId>` cursor (ascending publication date)
 * and throttles to stay under 30 requests/minute.
 */
@Injectable()
export class BzpClient {
  private readonly logger = new Logger(BzpClient.name);
  private lastRequestAt = 0;

  /** Yields pages of notices for the query until the API returns a short page. */
  async *fetchNoticePages(
    query: BzpNoticeQuery,
  ): AsyncGenerator<BzpNotice[], void, undefined> {
    let searchAfter: string | undefined;

    while (true) {
      const page = await this.fetchPage(query, searchAfter);

      if (page.length) {
        yield page;
      }

      if (page.length < PL_BZP_CONFIG.pageSize) {
        return;
      }

      searchAfter = page[page.length - 1].objectId;
    }
  }

  async fetchPage(
    query: BzpNoticeQuery,
    searchAfter?: string,
  ): Promise<BzpNotice[]> {
    const params: Record<string, string | number> = {
      NoticeType: query.noticeType,
      PublicationDateFrom: toBzpDate(query.publicationDateFrom),
      // The API treats `PublicationDateTo` as 24h later than sent (checked
      // live 2026-11-17), so shift it back to get the exact window.
      PublicationDateTo: toBzpDate(
        new Date(
          query.publicationDateTo.getTime() -
            PL_BZP_CONFIG.publicationDateToShiftMs,
        ),
      ),
      PageSize: PL_BZP_CONFIG.pageSize,
    };

    if (searchAfter) {
      params.SearchAfter = searchAfter;
    }

    for (let attempt = 0; ; attempt++) {
      await this.throttle();

      try {
        const response = await axios.get<BzpNotice[]>(
          PL_BZP_CONFIG.noticesUrl,
          { params, timeout: PL_BZP_CONFIG.requestTimeoutMs },
        );

        if (!Array.isArray(response.data)) {
          throw new Error('BZP API returned a non-array body');
        }

        return response.data;
      } catch (e: unknown) {
        const status = (e as AxiosError)?.response?.status;
        const retryable =
          status === 403 || status === 429 || !status || status >= 500;

        if (!retryable || attempt >= PL_BZP_CONFIG.maxRetries) {
          throw e;
        }

        const waitMs =
          status === 403 || status === 429
            ? PL_BZP_CONFIG.rateLimitBackoffMs
            : 5_000 * (attempt + 1);

        this.logger.warn(
          `BZP request failed (status ${status ?? 'network'}), retry ${attempt + 1} in ${waitMs}ms`,
        );
        await sleep(waitMs);
      }
    }
  }

  private async throttle() {
    const waitMs =
      this.lastRequestAt + PL_BZP_CONFIG.minRequestIntervalMs - Date.now();

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    this.lastRequestAt = Date.now();
  }
}
