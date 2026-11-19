import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { CurrencyExchangeRatesService } from '@/resources/currency-exchange-rates/currency-exchange-rates.service';
import {
  NationalStoreOutcome,
  NationalTenderStoreResult,
  NormalizedNationalAward,
} from './national-tender.types';
import {
  NationalAwardTenderLot,
  NationalAwardTenderModel,
} from './schemas/national-award-tender.schema';

export interface NationalAwardStoreOptions {
  /** Re-save even when the normalized content did not change. */
  force?: boolean;
  /** Shared `Buyer`s for the award's buyers (saved/changed awards only). */
  resolveLeadBuyers: (
    award: NormalizedNationalAward,
  ) => Promise<Types.ObjectId[]>;
  /** Shared `Contractor` per lot (undefined where no winner). */
  resolveWinners: (
    award: NormalizedNationalAward,
  ) => Promise<(Types.ObjectId | undefined)[]>;
  /** Called after each award with its outcome (live progress). */
  onStored?: (outcome: NationalStoreOutcome) => void;
}

/** Country-agnostic persistence of national results (`national_award_tenders`). */
@Injectable()
export class NationalAwardsStorageService {
  private readonly logger = new Logger(NationalAwardsStorageService.name);

  constructor(
    private readonly currencyExchangeRatesService: CurrencyExchangeRatesService,
  ) {}

  async storeMany(
    awards: NormalizedNationalAward[],
    options: NationalAwardStoreOptions,
  ): Promise<NationalTenderStoreResult> {
    const result: NationalTenderStoreResult = {
      saved: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
    };

    for (const award of awards) {
      try {
        const outcome = await this.storeOne(award, options);

        result[outcome] += 1;
        options.onStored?.(outcome);
      } catch (e: unknown) {
        result.failed += 1;
        options.onStored?.('failed');
        this.logger.warn(
          `Failed to store national award ${award.id}: ${
            e instanceof Error ? e.message : 'unknown error'
          }`,
        );
      }
    }

    return result;
  }

  private buildSourceHash(award: NormalizedNationalAward): string {
    const { rawData: _rawData, ...normalized } = award;

    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  private async storeOne(
    award: NormalizedNationalAward,
    options: NationalAwardStoreOptions,
  ): Promise<'saved' | 'updated' | 'unchanged'> {
    const sourceHash = this.buildSourceHash(award);
    const existing = await NationalAwardTenderModel.findOne({ id: award.id })
      .select('sourceHash')
      .lean();

    if (existing && existing.sourceHash === sourceHash && !options.force) {
      return 'unchanged';
    }

    const [leadBuyers, winnerIds] = await Promise.all([
      options.resolveLeadBuyers(award),
      options.resolveWinners(award),
    ]);
    const date = award.awardDate ?? award.publicationDate;

    const lots = await Promise.all(
      award.lots.map(async (lot, index): Promise<NationalAwardTenderLot> => {
        const { winner, ...rest } = lot;

        return {
          ...rest,
          isJointVenture: winner?.isJointVenture,
          winner: winnerIds[index],
          estimatedValueEur: await this.toEur(lot.estimatedValue, date),
          awardValueEur: await this.toEur(lot.awardValue, date),
        };
      }),
    );
    const winners = Array.from(
      new Map(
        winnerIds
          .filter((id): id is Types.ObjectId => !!id)
          .map((id) => [id.toString(), id] as const),
      ).values(),
    );
    const { buyers: _buyers, ...fields } = award;

    await NationalAwardTenderModel.updateOne(
      { id: award.id },
      {
        $set: {
          ...fields,
          lots,
          winners,
          leadBuyers,
          nonLeadBuyers: [],
          estimatedValueEur: await this.toEur(award.estimatedValue, date),
          awardValueEur: await this.toEur(award.awardValue, date),
          sourceHash,
        },
      },
      { upsert: true },
    );

    return existing ? 'updated' : 'saved';
  }

  private async toEur(
    value: { amount?: number | null; currency?: string | null } | undefined,
    date?: Date,
  ): Promise<number | null> {
    if (!value?.amount || !value.currency) {
      return null;
    }

    const eur = await this.currencyExchangeRatesService.convertToEur(
      value.amount,
      value.currency,
      date,
    );

    return eur === null ? null : Math.round(eur);
  }
}
