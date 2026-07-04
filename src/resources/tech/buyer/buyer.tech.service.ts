import _chunk from 'lodash/chunk';

import { TenderModel } from '@/resources/tenders/schemas';
import { BuyerNormalizer } from '@/resources/buyer/buyer.normalizer';
import { Injectable } from '@nestjs/common';
import { BuyerService } from '@/resources/buyer/buyer.service';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { AwardTenderService } from '@/resources/award-tender/award-tender.service';
import { TENDER_COMPETITION_SEARCH_FIELDS } from '@/config/ted-search.config';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { AWARD_HISTORY_FIELDS } from '@/config/award-tender.config';

export type CollectBuyersFromTendersResult = {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  totalTenders: number;
  processedTenders: number;
  noticesFetched: number;
  processedNotices: number;
  updatedTenders: number;
  errors: number;
  failedChunks: number;
};

export type CollectBuyersFromAwardTendersResult = {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  totalAwardTenders: number;
  processedAwardTenders: number;
  noticesFetched: number;
  processedNotices: number;
  updatedAwardTenders: number;
  errors: number;
  failedChunks: number;
};

const emptyCollectBuyersFromTendersStatus = (): CollectBuyersFromTendersResult => ({
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  totalTenders: 0,
  processedTenders: 0,
  noticesFetched: 0,
  processedNotices: 0,
  updatedTenders: 0,
  errors: 0,
  failedChunks: 0,
});

const emptyCollectBuyersFromAwardTendersStatus =
  (): CollectBuyersFromAwardTendersResult => ({
    isRunning: false,
    startedAt: null,
    finishedAt: null,
    lastError: null,
    totalAwardTenders: 0,
    processedAwardTenders: 0,
    noticesFetched: 0,
    processedNotices: 0,
    updatedAwardTenders: 0,
    errors: 0,
    failedChunks: 0,
  });

@Injectable()
export class BuyerTechService {
  normalizer = new BuyerNormalizer();
  private collectBuyersFromTendersStatus =
    emptyCollectBuyersFromTendersStatus();
  private collectBuyersFromAwardTendersStatus =
    emptyCollectBuyersFromAwardTendersStatus();

  constructor(
    private collector: TedOpenTendersCollectorService,
    private tendersService: TendersService,
    private awardTenderService: AwardTenderService,
    private buyerService: BuyerService,
  ) {}

  async collectBuyersFromTenderAndUnsetTenderFields(notice: TedNotice) {
    const tender = await TenderModel.findOne({
      id: notice['publication-number'],
    });

    if (!tender) {
      return;
    }

    const buyers =
      await this.buyerService.upsertPureBuyersFromTEDNotice(notice);

    return await this.tendersService.upsertTender(notice, buyers);
  }

  getCollectBuyersFromTendersStatus(): CollectBuyersFromTendersResult {
    return { ...this.collectBuyersFromTendersStatus };
  }

  startCollectBuyersFromTenderAllAndUnsetTenderFields(): CollectBuyersFromTendersResult {
    if (this.collectBuyersFromTendersStatus.isRunning) {
      return this.getCollectBuyersFromTendersStatus();
    }

    void this.collectBuyersFromTenderAllAndUnsetTenderFields();

    return this.getCollectBuyersFromTendersStatus();
  }

  async collectBuyersFromTenderAllAndUnsetTenderFields(): Promise<CollectBuyersFromTendersResult> {
    if (this.collectBuyersFromTendersStatus.isRunning) {
      return this.getCollectBuyersFromTendersStatus();
    }

    this.collectBuyersFromTendersStatus = {
      ...emptyCollectBuyersFromTendersStatus(),
      isRunning: true,
      startedAt: new Date(),
    };
    const result = this.collectBuyersFromTendersStatus;
    const tenders = await TenderModel.find({}).select('id').lean();

    result.totalTenders = tenders.length;

    try {
      const chunkedIds = _chunk(tenders, 100);

      for (let i = 0; i < chunkedIds.length; i++) {
        const chunk = chunkedIds[i];

        try {
          const collectResult = await this.collector.collectAnyTendersFromTed(
            {
              publicationNumber: chunk.map((t) => t.id),
            },
            TENDER_COMPETITION_SEARCH_FIELDS,
            {
              pageLimit: 70,
              maxPages: 100_000,
            },
            async (noticies: TedNotice[]) => {
              result.noticesFetched += noticies.length;

              for (let i = 0; i < noticies.length; i++) {
                const n = noticies[i];

                try {
                  const tender =
                    await this.collectBuyersFromTenderAndUnsetTenderFields(n);

                  result.processedNotices += 1;

                  if (tender) {
                    result.updatedTenders += 1;
                  }
                } catch (e) {
                  result.errors += 1;
                }
              }
            },
          );

          if (result.noticesFetched === 0) {
            result.noticesFetched += collectResult.noticesFetched;
          }
        } catch (e) {
          result.failedChunks += 1;
          result.errors += chunk.length;
        } finally {
          result.processedTenders += chunk.length;
        }
      }
    } catch (e) {
      result.lastError = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      result.isRunning = false;
      result.finishedAt = new Date();
    }

    return this.getCollectBuyersFromTendersStatus();
  }

  async collectBuyersFromAwardTender(notice: TedNotice) {
    const awardTender = await AwardTenderModel.findOne({
      id: notice['publication-number'],
    });

    if (!awardTender) {
      return;
    }

    return this.awardTenderService.upsertAwardTender(notice);
  }

  getCollectBuyersFromAwardTendersStatus(): CollectBuyersFromAwardTendersResult {
    return { ...this.collectBuyersFromAwardTendersStatus };
  }

  startCollectBuyersFromAwardTenderAll(): CollectBuyersFromAwardTendersResult {
    if (this.collectBuyersFromAwardTendersStatus.isRunning) {
      return this.getCollectBuyersFromAwardTendersStatus();
    }

    void this.collectBuyersFromAwardTenderAll();

    return this.getCollectBuyersFromAwardTendersStatus();
  }

  async collectBuyersFromAwardTenderAll(): Promise<CollectBuyersFromAwardTendersResult> {
    if (this.collectBuyersFromAwardTendersStatus.isRunning) {
      return this.getCollectBuyersFromAwardTendersStatus();
    }

    this.collectBuyersFromAwardTendersStatus = {
      ...emptyCollectBuyersFromAwardTendersStatus(),
      isRunning: true,
      startedAt: new Date(),
    };
    const result = this.collectBuyersFromAwardTendersStatus;
    const awardTenders = await AwardTenderModel.find({}).select('id').lean();

    result.totalAwardTenders = awardTenders.length;

    try {
      const chunkedIds = _chunk(awardTenders, 50);

      for (let i = 0; i < chunkedIds.length; i++) {
        const chunk = chunkedIds[i];

        try {
          const collectResult = await this.collector.collectAnyTendersFromTed(
            {
              publicationNumber: chunk.map((t) => t.id),
            },
            AWARD_HISTORY_FIELDS,
            {
              pageLimit: 50,
              maxPages: 100_000,
            },
            async (noticies: TedNotice[]) => {
              result.noticesFetched += noticies.length;

              for (let i = 0; i < noticies.length; i++) {
                const n = noticies[i];

                try {
                  const awardTender = await this.collectBuyersFromAwardTender(n);

                  result.processedNotices += 1;

                  if (awardTender) {
                    result.updatedAwardTenders += 1;
                  }
                } catch (e) {
                  result.errors += 1;
                }
              }
            },
          );

          if (result.noticesFetched === 0) {
            result.noticesFetched += collectResult.noticesFetched;
          }
        } catch (e) {
          result.failedChunks += 1;
          result.errors += chunk.length;
        } finally {
          result.processedAwardTenders += chunk.length;
        }
      }
    } catch (e) {
      result.lastError = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      result.isRunning = false;
      result.finishedAt = new Date();
    }

    return this.getCollectBuyersFromAwardTendersStatus();
  }
}
