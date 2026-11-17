import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { BuyerService } from '@/resources/buyer/buyer.service';
import {
  NationalTenderBuyer,
  NationalTenderSource,
} from '@/resources/national-tenders/core/national-tender.types';
import { NationalTenderModel } from '@/resources/national-tenders/core/schemas/national-tender.schema';

const MIGRATE_BATCH_SIZE = 200;
const STATS_BATCH_SIZE = 50;

export interface NationalBuyersMigrationResult {
  tendersMigrated: number;
  buyersTouched: number;
  failed: number;
}

/** Identifiers as TED stores them for the same organization (digits only). */
export function nationalBuyerIdentifiers(buyer: NationalTenderBuyer): string[] {
  // registryId sometimes repeats the tax id ("NIP 8722128819").
  const ids = [buyer.nationalId, buyer.registryId]
    .map((value) => value?.replace(/\D/g, ''))
    .filter((value): value is string => !!value && value.length >= 9);

  return Array.from(new Set(ids));
}

/**
 * Buyers of national tenders live in the shared `buyers` collection (same
 * records as TED buyers, matched by tax/registry id), so buyer pages, stats
 * and buyer intelligence cover national tenders too.
 */
@Injectable()
export class NationalBuyersService {
  private readonly logger = new Logger(NationalBuyersService.name);

  constructor(private readonly buyerService: BuyerService) {}

  /** Finds or creates the shared `Buyer`s for a tender's buyers, in order. */
  async resolveBuyers(
    buyers: NationalTenderBuyer[],
    cpvCodes: string[],
  ): Promise<Types.ObjectId[]> {
    const ids: Types.ObjectId[] = [];

    for (const buyer of buyers) {
      const record = await this.buyerService.upsertNationalBuyer({
        name: buyer.name,
        identifiers: nationalBuyerIdentifiers(buyer),
        country: buyer.country,
        street: buyer.street,
        postCode: buyer.postalCode,
        city: buyer.city,
        countrySub: buyer.nuts,
        email: buyer.email,
        website: buyer.website,
        cpvCodes,
      });

      ids.push(new Types.ObjectId(String(record._id)));
    }

    return ids;
  }

  /** Recomputes buyer stats (tender counts etc.) for the given buyers. */
  async refreshStats(buyerIds: string[]) {
    const unique = Array.from(new Set(buyerIds));

    for (let i = 0; i < unique.length; i += STATS_BATCH_SIZE) {
      try {
        await this.buyerService.refreshBuyersTenderMeta(
          unique.slice(i, i + STATS_BATCH_SIZE),
        );
      } catch (e: unknown) {
        this.logger.warn(
          `Failed to refresh buyer stats: ${
            e instanceof Error ? e.message : 'unknown error'
          }`,
        );
      }
    }
  }

  /**
   * One-off: tenders stored before shared buyers kept them inline in
   * `buyers[]`. Links them (if not linked yet) and removes the inline copy.
   */
  async migrateInlineBuyers(
    source: NationalTenderSource,
  ): Promise<NationalBuyersMigrationResult> {
    const result: NationalBuyersMigrationResult = {
      tendersMigrated: 0,
      buyersTouched: 0,
      failed: 0,
    };
    const touched = new Set<string>();
    const failedIds: Types.ObjectId[] = [];
    // Raw collection: `buyers` is no longer in the schema.
    const collection = NationalTenderModel.collection;

    while (true) {
      const tenders = await collection
        .find(
          { source, buyers: { $exists: true }, _id: { $nin: failedIds } },
          { projection: { id: 1, buyers: 1, leadBuyers: 1, cpvCodes: 1 } },
        )
        .limit(MIGRATE_BATCH_SIZE)
        .toArray();

      if (!tenders.length) {
        break;
      }

      for (const tender of tenders) {
        try {
          const linked = (tender.leadBuyers ?? []) as Types.ObjectId[];
          const leadBuyers = linked.length
            ? linked
            : await this.resolveBuyers(
                (tender.buyers ?? []) as NationalTenderBuyer[],
                (tender.cpvCodes ?? []) as string[],
              );

          await collection.updateOne(
            { _id: tender._id },
            { $set: { leadBuyers }, $unset: { buyers: '' } },
          );
          leadBuyers.forEach((id) => touched.add(id.toString()));
          result.tendersMigrated += 1;
        } catch (e: unknown) {
          failedIds.push(tender._id);
          result.failed += 1;
          this.logger.warn(
            `Failed to migrate buyers of ${String(tender.id)}: ${
              e instanceof Error ? e.message : 'unknown error'
            }`,
          );
        }
      }
    }

    await this.refreshStats([...touched]);
    result.buyersTouched = touched.size;

    return result;
  }
}
