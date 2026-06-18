import { Injectable } from '@nestjs/common';
import { AwardTenderService } from '@/resources/award-tender/award-tender.service';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { TedSearchService } from '@/resources/ted-search/ted-search.service';
import { TendersService } from '@/resources/tenders/tenders.service';
import { AWARD_TENDER_CONFIG } from '@/config/award-tender.config';

@Injectable()
export class AwardTendersTechService {
  constructor(
    private readonly tedSearchService: TedSearchService,
    private readonly tendersService: TendersService,
    private readonly awardTenderService: AwardTenderService,
  ) {
    setTimeout(() => {
      // this.refreshAwardTendersHistory();
    }, 3000);
  }

  refreshAwardTendersHistory() {
    return new TedOpenTendersCollectorService(
      this.tedSearchService,
      this.tendersService,
      this.awardTenderService,
    ).collectResultTendersFromTed(
      { lookbackYears: AWARD_TENDER_CONFIG.historyYearsBack },
      {
        pageLimit: 100,
        maxPages: 100_000,
        updateExisting: true,
      },
    );
  }
}
