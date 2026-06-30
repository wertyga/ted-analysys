import _chunk from 'lodash/chunk';

import { TenderModel } from '@/resources/tenders/schemas';
import { BuyerNormalizer } from '@/resources/buyer/buyer.normalizer';
import { Injectable } from '@nestjs/common';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import { BuyerService } from '@/resources/buyer/buyer.service';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { AwardTenderService } from '@/resources/award-tender/award-tender.service';
import { TENDER_COMPETITION_SEARCH_FIELDS } from '@/config/ted-search.config';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { AWARD_HISTORY_FIELDS } from '@/config/award-tender.config';

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
    const tender = await TenderModel.findOne({
      id: notice['publication-number'],
    });

    if (!tender) {
      return;
    }

    return await this.tendersService.upsertTender(notice);
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

  async collectBuyersFromAwardTender(notice: TedNotice) {
    const awardTender = await AwardTenderModel.findOne({
      id: notice['publication-number'],
    });

    if (!awardTender) {
      return;
    }

    return this.awardTenderService.upsertAwardTender(notice);
  }

  async collectBuyersFromAwardTenderAll() {
    const awardTenders = await AwardTenderModel.find({}).select('id').lean();

    const chunkedIds = _chunk(awardTenders, 100);

    for (let i = 0; i < chunkedIds.length; i++) {
      const chunk = chunkedIds[i];

      await this.collector.collectAnyTendersFromTed(
        {
          publicationNumber: chunk.map((t) => t.id),
        },
        AWARD_HISTORY_FIELDS,
        {
          pageLimit: 50,
          maxPages: 100_000,
        },
        async (noticies: TedNotice[]) => {
          let errors = 0;

          for (let i = 0; i < noticies.length; i++) {
            const n = noticies[i];

            try {
              await this.collectBuyersFromAwardTender(n);
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
