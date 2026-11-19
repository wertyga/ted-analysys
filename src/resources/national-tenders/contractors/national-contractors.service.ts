import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { ContractorService } from '@/resources/contractor/contractor.service';
import { NormalizedNationalAward } from '@/resources/national-tenders/core/national-tender.types';

/**
 * Winners of national results live in the shared `contractors` collection
 * (same records as TED winners, matched by tax id), so contractor pages and
 * stats cover national results too.
 */
@Injectable()
export class NationalContractorsService {
  private readonly logger = new Logger(NationalContractorsService.name);

  constructor(private readonly contractorService: ContractorService) {}

  /** Shared `Contractor` per lot of the award (undefined where no winner). */
  async resolveWinners(
    award: NormalizedNationalAward,
  ): Promise<(Types.ObjectId | undefined)[]> {
    const ids: (Types.ObjectId | undefined)[] = [];

    for (const lot of award.lots) {
      if (!lot.winner) {
        ids.push(undefined);
        continue;
      }

      const record = await this.contractorService.upsertNationalWinner(
        lot.winner,
      );

      ids.push(new Types.ObjectId(String(record._id)));
    }

    return ids;
  }

  /** Recomputes contractor stats (wins, awarded amounts) for the given ones. */
  async refreshStats(contractorIds: string[]) {
    try {
      await this.contractorService.refreshContractorsAwardMeta(contractorIds);
    } catch (e: unknown) {
      this.logger.warn(
        `Failed to refresh contractor stats: ${
          e instanceof Error ? e.message : 'unknown error'
        }`,
      );
    }
  }
}
