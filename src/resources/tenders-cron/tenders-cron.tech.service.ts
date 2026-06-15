import { Injectable, Logger } from '@nestjs/common';
import { TendersService } from '@/resources/tenders/tenders.service';
import { logger } from '@/utils';
import { TenderModel } from '@/resources/tenders/schemas';
import { TendersCronService } from '@/resources/tenders-cron/tenders-cron.service';
import { CurrencyExchangeRatesService } from '@/resources/currency-exchange-rates/currency-exchange-rates.service';
import { TENDERS_CRON_CONFIG } from '@/config/tenders-cron.config';

interface UpdateTenderEstimatedValueEurResult {
  scanned: number;
  updated: number;
  skipped: number;
  fixedInvalidAmounts: number;
}

@Injectable()
export class TendersCronTechService {
  private readonly logger = new Logger(TendersCronTechService.name);
  private isUpdatingTenderEstimatedValuesEur = false;

  constructor(
    private readonly tendersService: TendersService,
    private readonly currencyExchangeRatesService: CurrencyExchangeRatesService,
    private tendersCronService: TendersCronService,
  ) {
    setTimeout(async () => {
      if (process.env.NEED_TO_SYNC_CURRENCY_EXCHANGE_RATES_INITIALY) {
        await this.currencyExchangeRatesService.syncLatestRatesCron();
      }

      // if (process.env.NEED_TOGATHER_TED_BASE_INITIALY) {
      //   await this.tendersCronService.gatherAllCompetitionTenders();
      // }

      if (process.env.NEED_TO_UPDATE_TENDER_ESTIMATED_VALUE_EUR_INITIALY) {
        await this.updateExistingTenderEstimatedValuesEur();
      }
    }, TENDERS_CRON_CONFIG.tech.initialRunDelayMs);
  }

  async updateExistingTenderEstimatedValuesEur(): Promise<void> {
    if (this.isUpdatingTenderEstimatedValuesEur) {
      this.logger.warn(
        'Tender estimatedValueEur update is already running, skipping',
      );
      return;
    }

    this.isUpdatingTenderEstimatedValuesEur = true;

    try {
      const result = await this.updateTenderEstimatedValuesEur(
        TENDERS_CRON_CONFIG.tech.estimatedValueEurUpdateBatchSize,
      );

      await logger.info('TENDER_ESTIMATED_VALUE_EUR_UPDATED', result);
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'unknown error';

      this.logger.error(`Tender estimatedValueEur update failed: ${error}`);
      await logger.error('TENDER_ESTIMATED_VALUE_EUR_UPDATE_FAILED', error);
    } finally {
      this.isUpdatingTenderEstimatedValuesEur = false;
    }
  }

  private async updateTenderEstimatedValuesEur(
    batchSize: number,
  ): Promise<UpdateTenderEstimatedValueEurResult> {
    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let fixedInvalidAmounts = 0;
    let lastTenderId: unknown;

    while (true) {
      const query: Record<string, unknown> = {};

      if (lastTenderId) {
        query._id = { $gt: lastTenderId };
      }

      const tenders = await TenderModel.find(query)
        .select('_id estimatedValue publicationDate estimatedValueEur')
        .sort({ _id: 1 })
        .limit(batchSize)
        .exec();

      if (tenders.length === 0) {
        break;
      }

      for (const tender of tenders) {
        scanned += 1;

        const amount = tender.estimatedValue?.amount;
        const shouldFixInvalidAmount =
          typeof amount === 'number' && amount <= 0;
        const estimatedValueEur =
          await this.tendersService.calculateEstimatedValueEur(tender);

        if (
          tender.estimatedValueEur === estimatedValueEur &&
          !shouldFixInvalidAmount
        ) {
          skipped += 1;
          continue;
        }

        const set: Record<string, unknown> = { estimatedValueEur };

        if (shouldFixInvalidAmount) {
          set['estimatedValue.amount'] = null;
          fixedInvalidAmounts += 1;
        }

        await TenderModel.updateOne({ _id: tender._id }, { $set: set }).exec();
        updated += 1;
      }

      lastTenderId = tenders[tenders.length - 1]._id;
    }

    return { scanned, updated, skipped, fixedInvalidAmounts };
  }
}
