import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { CurrencySign } from '@/resources/codelist';
import { logger } from '@/utils';
import {
  CurrencyExchangeRate,
  CurrencyExchangeRateDocument,
  CurrencyExchangeRateModel,
} from './schemas';
import { CURRENCY_EXCHANGE_RATES_CONFIG } from '@/config/currency-exchange-rates.config';

interface EcbExchangeRate {
  currency: CurrencySign;
  ratePerEuro: number;
}

export interface CurrencyExchangeRateSyncResult {
  date: Date;
  ratesSaved: number;
}

@Injectable()
export class CurrencyExchangeRatesService {
  private readonly logger = new Logger(CurrencyExchangeRatesService.name);
  private isSyncing = false;

  @Cron(CURRENCY_EXCHANGE_RATES_CONFIG.cron, {
    timeZone: CURRENCY_EXCHANGE_RATES_CONFIG.timeZone,
  })
  async syncLatestRatesCron(): Promise<void> {
    if (this.isSyncing) {
      this.logger.warn('Currency exchange rates sync is already running');
      return;
    }

    this.isSyncing = true;

    try {
      const result = await this.syncLatestRatesFromEcb();

      await logger.info('CURRENCY_EXCHANGE_RATES_SYNCED', result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';

      this.logger.error(`Currency exchange rates sync failed: ${message}`);
      await logger.error('CURRENCY_EXCHANGE_RATES_SYNC_FAILED', message);
    } finally {
      this.isSyncing = false;
    }
  }

  async syncLatestRatesFromEcb(): Promise<CurrencyExchangeRateSyncResult> {
    const response = await axios.get<string>(
      CURRENCY_EXCHANGE_RATES_CONFIG.ecbDailyRatesUrl,
      {
        timeout: CURRENCY_EXCHANGE_RATES_CONFIG.requestTimeoutMs,
        responseType: 'text',
      },
    );
    const { date, rates } = this.parseEcbDailyRates(response.data);
    const fetchedAt = new Date();
    const baseCurrency: CurrencySign.EUR = CurrencySign.EUR;
    const documents: CurrencyExchangeRate[] = [
      {
        date,
        baseCurrency,
        currency: CurrencySign.EUR,
        ratePerEuro: 1,
        eurPerUnit: 1,
        fetchedAt,
      },
      ...rates.map((rate) => ({
        date,
        baseCurrency,
        currency: rate.currency,
        ratePerEuro: rate.ratePerEuro,
        eurPerUnit: 1 / rate.ratePerEuro,
        fetchedAt,
      })),
    ];

    if (documents.length === 0) {
      throw new Error('ECB exchange rates response did not contain rates');
    }

    await CurrencyExchangeRateModel.bulkWrite(
      documents.map((document) => ({
        updateOne: {
          filter: {
            date: document.date,
            currency: document.currency,
          },
          update: { $set: document },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return {
      date,
      ratesSaved: documents.length,
    };
  }

  async convertToEur(
    amount: number | null | undefined,
    currency: CurrencySign | null | undefined | string,
    date?: Date,
  ): Promise<number | null> {
    const normalizedCurrency = currency?.trim().toUpperCase() as CurrencySign;

    if (!Number.isFinite(amount) || !CurrencySign[normalizedCurrency]) {
      return null;
    }

    if (normalizedCurrency === CurrencySign.EUR) {
      return amount as number;
    }

    const rate = await this.findRate(normalizedCurrency, date);

    return rate ? (amount as number) * rate.eurPerUnit : null;
  }

  async findRate(
    currency: CurrencySign,
    date?: Date,
  ): Promise<CurrencyExchangeRateDocument | null> {
    const query = date
      ? {
          currency,
          date: { $lte: startOfUtcDay(date) },
        }
      : {
          currency,
        };

    let rate = await CurrencyExchangeRateModel.findOne(query).sort({
      date: -1,
    });

    if (!rate) {
      rate = await CurrencyExchangeRateModel.findOne({ currency }).sort({
        date: -1,
      });
    }

    return rate;
  }

  private parseEcbDailyRates(xml: string): {
    date: Date;
    rates: EcbExchangeRate[];
  } {
    const dateMatch = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/);

    if (!dateMatch) {
      throw new Error('ECB exchange rates response date not found');
    }

    const rates: EcbExchangeRate[] = [];
    const ratePattern =
      /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g;
    let match: RegExpExecArray | null;

    while ((match = ratePattern.exec(xml)) !== null) {
      const currency = match[1] as CurrencySign;
      const ratePerEuro = Number(match[2]);

      if (
        Object.values(CurrencySign).includes(currency) &&
        Number.isFinite(ratePerEuro) &&
        ratePerEuro > 0
      ) {
        rates.push({ currency, ratePerEuro });
      }
    }

    if (rates.length === 0) {
      throw new Error('ECB exchange rates response rates not found');
    }

    return {
      date: startOfUtcDay(new Date(`${dateMatch[1]}T00:00:00.000Z`)),
      rates,
    };
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
