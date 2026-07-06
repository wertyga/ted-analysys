import _chunk from 'lodash/chunk';

import { TenderModel } from '@/resources/tenders/schemas';
import {
  BuyerNormalized,
  BuyerNormalizer,
} from '@/resources/buyer/buyer.normalizer';
import { Injectable } from '@nestjs/common';
import { BuyerService } from '@/resources/buyer/buyer.service';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { AwardTenderService } from '@/resources/award-tender/award-tender.service';
import { TENDER_COMPETITION_SEARCH_FIELDS } from '@/config/ted-search.config';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { AWARD_HISTORY_FIELDS } from '@/config/award-tender.config';
import { Buyer, BuyerDocument, BuyerModel } from '@/resources/buyer/schemas';
import { getLegalTypes, getMainActivities } from '@/resources/codelist';
import { getUniqArray } from '@/utils';

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

const getLastExisting = (...values: Array<string | null | undefined>) =>
  values.findLast((value) => value?.trim()) ?? '';

const emptyCollectBuyersFromTendersStatus =
  (): CollectBuyersFromTendersResult => ({
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

    return await this.tendersService.upsertTender(notice);
  }

  upsertBuyersFromListOfTEDNotices(
    notices: TedNotice[],
  ): Omit<
    Buyer,
    | 'stats'
    | '_id'
    | 'createdAt'
    | 'updatedAt'
    | 'statsVersion'
    | 'intelligence'
  >[] {
    const buyersByKey = new Map<string, BuyerNormalized[]>();
    notices
      .flatMap((notice) => this.normalizer.normalizeBuyersFromTEDNotice(notice))
      .forEach((b) => {
        const key = b.name.trim();
        buyersByKey.set(key, [...(buyersByKey.get(key) ?? []), b]);
      });

    return Array.from(buyersByKey.values()).map((buyers) => {
      const address = {
        street: getLastExisting(...buyers.map((b) => b.address?.street)),
        postCode: getLastExisting(...buyers.map((b) => b.address?.postCode)),
        city: getLastExisting(...buyers.map((b) => b.address?.city)),
        country: getLastExisting(...buyers.map((b) => b.address?.country)),
        countrySub: getLastExisting(
          ...buyers.map((b) => b.address?.countrySub),
        ),
      };

      const contact: BuyerDocument['contact'] = {
        contactPoint: getLastExisting(
          ...buyers.map((b) => b.contact?.contactPoint),
        ),
        person: getLastExisting(...buyers.map((b) => b.contact?.person)),
        email: getLastExisting(...buyers.map((b) => b.contact?.email)),
        phone: getLastExisting(...buyers.map((b) => b.contact?.phone)),
        fax: getLastExisting(...buyers.map((b) => b.contact?.fax)),
        website: getLastExisting(...buyers.map((b) => b.contact?.website)),
        gateway: getLastExisting(...buyers.map((b) => b.contact?.gateway)),
      };

      return {
        name: getLastExisting(...buyers.map((b) => b.name)),
        identifiers: Array.from(
          new Set([...buyers.flatMap((b) => b.identifiers ?? [])]),
        ),
        contact,
        address,
        legalTypes: this.buyerService.mergeCodeNameOptions(
          ...buyers.map((b) => getLegalTypes(b.legalTypes)),
        ),
        mainActivities: this.buyerService.mergeCodeNameOptions(
          ...buyers.map((b) => getLegalTypes(b.mainActivities)),
        ),
        profiles: getUniqArray(...buyers.map((b) => b.profiles)),
        gateways: getUniqArray(...buyers.map((b) => b.gateways)),
        websites: getUniqArray(...buyers.map((b) => b.websites)),
        cpvCodes: getUniqArray(
          buyers.flatMap((b) => {
            if (b.isLead) {
              return b.cpvCodes;
            }
            return [];
          }),
        ),
        countries: getUniqArray(...buyers.map((b) => b.countries)),
      };
    });
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
    const buyerIds = await this.getAllTenderBuyerIds();

    result.totalTenders = buyerIds.length;

    try {
      const chunkedIds = _chunk(buyerIds, 100);

      for (let i = 0; i < chunkedIds.length; i++) {
        const chunk = chunkedIds[i];

        try {
          const updatedBuyers =
            await this.buyerService.refreshBuyersTenderMeta(chunk);

          result.updatedTenders += updatedBuyers.length;
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
    const buyerIds = await this.getAwardTenderBuyerIds();

    result.totalAwardTenders = buyerIds.length;

    try {
      const chunkedIds = _chunk(buyerIds, 100);

      for (let i = 0; i < chunkedIds.length; i++) {
        const chunk = chunkedIds[i];

        try {
          const updatedBuyers =
            await this.buyerService.refreshBuyersTenderMeta(chunk);

          result.updatedAwardTenders += updatedBuyers.length;
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

  private async getTenderBuyerIds(): Promise<string[]> {
    // const [leadBuyerIds, nonLeadBuyerIds] = await Promise.all([
    //   TenderModel.find({}).select('leadBuyers nonLeadBuyers'),
    //   TenderModel.distinct('nonLeadBuyers'),
    // ]);
    const bb = await TenderModel.find({}).select('leadBuyers nonLeadBuyers');
    return getUniqArray(
      bb.flatMap((b) => [...b.leadBuyers, b.nonLeadBuyers]),
    ).map((id) => id.toString());
  }

  private async getAllTenderBuyerIds(): Promise<string[]> {
    const [tenderBuyerIds, awardTenderBuyerIds] = await Promise.all([
      this.getTenderBuyerIds(),
      this.getAwardTenderBuyerIds(),
    ]);

    return getUniqArray([...tenderBuyerIds, ...awardTenderBuyerIds]);
  }

  private async getAwardTenderBuyerIds(): Promise<string[]> {
    // const [leadBuyerIds, nonLeadBuyerIds] = await Promise.all([
    //   AwardTenderModel.distinct('leadBuyers'),
    //   AwardTenderModel.distinct('nonLeadBuyers'),
    // ]);
    // console.log(await BuyerModel.countDocuments({}));
    const bb = await BuyerModel.find({}).select('_id');

    return bb.map((b) => b._id.toString());

    // return getUniqArray(
    //   bb.flatMap((b) => [...b.leadBuyers, b.nonLeadBuyers]),
    // ).map((id) => id.toString());
  }
}
