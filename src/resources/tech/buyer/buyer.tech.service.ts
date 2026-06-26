import _chunk from 'lodash/chunk';

import {
  Tender,
  TenderDocument,
  TenderModel,
  TenderShortTitle,
} from '@/resources/tenders/schemas';
import { BuyerNormalizer } from '@/resources/buyer/buyer.normalizer';
import { Injectable } from '@nestjs/common';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import { BuyerService } from '@/resources/buyer/buyer.service';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { AwardTenderService } from '@/resources/award-tender/award-tender.service';
import { TENDER_COMPETITION_SEARCH_FIELDS } from '@/config/ted-search.config';
import mongoose from 'mongoose';

@Injectable()
export class BuyerTechService {
  normalizer = new BuyerNormalizer();
  collector: TedOpenTendersCollectorService;

  constructor(
    private tedSearchService: TedSearchService,
    private buyerService: BuyerService,
    private tendersService: TendersService,
    private awardTenderService: AwardTenderService,
  ) {
    this.collector = new TedOpenTendersCollectorService(
      this.tedSearchService,
      this.tendersService,
      this.awardTenderService,
    );
  }

  async collectBuyersFromTenderAndUnsetTenderFields(notice: TedNotice) {
    const buyer = await this.buyerService.upsertBuyerFromTEDNotice(notice);
    const tender = await TenderModel.findOneAndUpdate(
      { id: notice['publication-number'] },
      {
        $set: {
          buyer: buyer._id,
        },
        $unset: {
          buyerName: 1,
          buyerIdentifier: 1,
          buyerCountry: 1,
          buyerCity: 1,
          buyerMainActivities: 1,
          buyerEmail: 1,
          buyerInternetAddress: 1,
          buyerProfile: 1,
        },
      },
      { returnDocument: 'after' },
    );

    buyer.tenders = Array.from(
      new Set([...buyer.tenders, (tender as TenderDocument)._id]),
    ) as TenderDocument[];

    buyer.set(
      await this.buyerService.getTendersBuyerMeta(buyer.tenders as any),
    );

    return buyer.save();
  }

  async collectBuyersFromTenderAllAndUnsetTenderFields() {
    const tenders = await TenderModel.find({}).select('id').lean();

    const chunkedIds = _chunk(tenders, 100);

    for (let i = 0; i < chunkedIds.length; i++) {
      const chunk = chunkedIds[i];

      await this.collector.collectAnyTendersFromTed(
        {
          publicationNumber: chunk.map((t) => t.id),
        },
        TENDER_COMPETITION_SEARCH_FIELDS,
        {
          pageLimit: 80,
          maxPages: 100_000,
        },
        async (noticies: TedNotice[]) => {
          let errors = 0;

          for (let i = 0; i < noticies.length; i++) {
            const n = noticies[i];

            try {
              await this.collectBuyersFromTenderAndUnsetTenderFields(n);
            } catch (e) {
              console.log({ e });
              errors += 1;
            }
          }

          return {
            saved: noticies.length - errors,
            updated: noticies.length - errors,
            skipped: errors,
          };
        },
      );
    }
  }
}
