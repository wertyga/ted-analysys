import { Injectable } from '@nestjs/common';
import { TedOpenTendersCollectorService } from '@/resources/ted-open-tenders-collector/ted-open-tenders-collector.service';
import { AWARD_TENDER_CONFIG } from '@/config/award-tender.config';
import { TedTenderSearchFilters } from '@/resources/ted-search/ted-builders';

@Injectable()
export class AwardTendersTechService {
  constructor(
    private readonly tedOpenTendersCollectorService: TedOpenTendersCollectorService,
  ) {}

  refreshAwardTendersHistory(filters?: TedTenderSearchFilters) {
    return this.tedOpenTendersCollectorService.collectResultTendersFromTed(
      { lookbackYears: AWARD_TENDER_CONFIG.historyYearsBack, filters },
      {
        updateExisting: true,
      },
    );
  }
}
