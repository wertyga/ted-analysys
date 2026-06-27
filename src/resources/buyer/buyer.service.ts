import mongoose, { Types } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { BuyerNormalizer } from './buyer.normalizer';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import {
  BuyerDocument,
  BuyerModel,
  BuyerStats,
} from './schemas';
import { getMongoRelationObjectIdArray, getUniqArray } from '@/utils';

import { TenderModel } from '@/resources/tenders/schemas';
import {
  AwardTenderDocument,
  AwardTenderModel,
} from '@/resources/award-tender/schemas';
import { TMongoId } from '@/types';
import {
  BuyerIntelligenceCalculation,
  calculateBuyerIntelligenceSignals,
  getDatesBuyerTendersStats,
  getEmptyBuyerStats,
  getMoneyBuyerTendersStats,
  getTopBuyerTendersStats,
} from './buyer-utils';
import { ContractorModel } from '@/resources/contractor/schemas';

type BuyerTenderMeta = {
  stats: BuyerStats;
  intelligence: BuyerIntelligenceCalculation;
};

@Injectable()
export class BuyerService {
  normalizer = new BuyerNormalizer();

  private async getWinnerCountriesById(
    awardTenders: AwardTenderDocument[],
  ): Promise<Map<string, string[]>> {
    const winnerIds = getMongoRelationObjectIdArray(
      awardTenders.flatMap((awardTender) => awardTender.winners ?? []),
    );

    if (!winnerIds.length) {
      return new Map();
    }

    const contractorFilter: Record<string, unknown> = {
      _id: { $in: winnerIds },
    };
    const contractors = await ContractorModel.find(contractorFilter as never)
      .select('countries')
      .lean();

    return new Map(
      contractors.map((contractor) => [
        contractor._id.toString(),
        contractor.countries ?? [],
      ]),
    );
  }

  async getTendersBuyerMetaAndIntelligence(
    buyerId: string | mongoose.Types.ObjectId,
    buyerCountry?: string,
  ): Promise<BuyerTenderMeta> {
    const buyerObjectId = new Types.ObjectId(buyerId);
    const tenderSelectFields =
      'publicationDate estimatedValueEur cpvCodes placeOfPerformanceCountries';
    const awardTenderSelectFields =
      'publicationDate awardValueEur cpvCodes placeOfPerformanceCountries winners';

    const [tenders, awardTenders] = await Promise.all([
      TenderModel.find({
        buyer: buyerObjectId,
      })
        .select(tenderSelectFields)
        .lean(),
      AwardTenderModel.find({
        buyer: buyerObjectId,
      })
        .select(awardTenderSelectFields)
        .lean(),
    ]);

    const tendersCount = tenders.length;
    const awardTendersCount = awardTenders.length;

    const stats = {
      tendersCount,
      awardTendersCount,
      ...getDatesBuyerTendersStats(tenders, awardTenders),
      ...getMoneyBuyerTendersStats(tenders, awardTenders),
      ...getTopBuyerTendersStats(tenders, awardTenders),
    };

    const winnerCountriesById = await this.getWinnerCountriesById(awardTenders);

    const intelligence = calculateBuyerIntelligenceSignals({
      buyerCountry,
      stats,
      awardTenders,
      winnerCountriesById,
    });

    return {
      stats,
      intelligence,
    };
  }

  async refreshBuyerTenderMeta(
    buyerId: TMongoId,
  ): Promise<BuyerDocument | null> {
    const buyer = await BuyerModel.findById(buyerId).select(
      'address.country intelligence',
    );
    const { stats, intelligence } =
      await this.getTendersBuyerMetaAndIntelligence(
        buyerId,
        buyer?.address?.country,
      );

    return BuyerModel.findByIdAndUpdate(
      buyerId,
      {
        $set: {
          stats,
          intelligence,
        },
      },
      { returnDocument: 'after' },
    );
  }

  async upsertBuyerFromTEDNotice(notice: TedNotice): Promise<BuyerDocument> {
    const normalizedBuyer = this.normalizer.normalizeBuyerFromTEDNotice(notice);

    const identityFilter =
      normalizedBuyer.organisationIdentifierBuyer &&
      normalizedBuyer.address.country
        ? {
            organisationIdentifierBuyer:
              normalizedBuyer.organisationIdentifierBuyer,
            'address.country': normalizedBuyer.address.country,
          }
        : {
            name: normalizedBuyer.name,
            'address.country': normalizedBuyer.address.country,
          };

    const existingBuyer = await BuyerModel.findOne(identityFilter);

    if (!existingBuyer) {
      return BuyerModel.create({
        ...normalizedBuyer,
        stats: getEmptyBuyerStats(),
      });
    }

    const getLastExisting = (...values: Array<string | null | undefined>) =>
      values.findLast((value) => value?.trim()) ?? '';

    const address = {
      street: getLastExisting(
        existingBuyer.address?.street,
        normalizedBuyer.address.street,
      ),
      postCode: getLastExisting(
        existingBuyer.address?.postCode,
        normalizedBuyer.address.postCode,
      ),
      city: getLastExisting(
        existingBuyer.address?.city,
        normalizedBuyer.address.city,
      ),
      country: getLastExisting(
        existingBuyer.address?.country,
        normalizedBuyer.address.country,
      ),
      countrySub: getLastExisting(
        existingBuyer.address?.countrySub,
        normalizedBuyer.address.countrySub,
      ),
    };
    const { stats, intelligence } =
      await this.getTendersBuyerMetaAndIntelligence(
        existingBuyer._id,
        address.country,
      );

    existingBuyer.set({
      stats,
      intelligence,
      name: getLastExisting(existingBuyer.name, normalizedBuyer.name),
      organisationIdentifierBuyer: getLastExisting(
        existingBuyer.organisationIdentifierBuyer,
        normalizedBuyer.organisationIdentifierBuyer,
      ),
      contact: {
        contactPoint: getLastExisting(
          existingBuyer.contact?.contactPoint,
          normalizedBuyer.contact.contactPoint,
        ),
        person: getLastExisting(
          existingBuyer.contact?.person,
          normalizedBuyer.contact.person,
        ),
        email: getLastExisting(
          existingBuyer.contact?.email,
          normalizedBuyer.contact.email,
        ),
        phone: getLastExisting(
          existingBuyer.contact?.phone,
          normalizedBuyer.contact.phone,
        ),
        fax: getLastExisting(
          existingBuyer.contact?.fax,
          normalizedBuyer.contact.fax,
        ),
        website: getLastExisting(
          existingBuyer.contact?.website,
          normalizedBuyer.contact.website,
        ),
        gateway: getLastExisting(
          existingBuyer.contact?.gateway,
          normalizedBuyer.contact.gateway,
        ),
      },
      address,
      identifiers: Array.from(
        new Map(
          [...existingBuyer.identifiers, ...normalizedBuyer.identifiers].map(
            (identifier) => [
              `${identifier.type}:${identifier.value}`,
              identifier,
            ],
          ),
        ).values(),
      ),
      legalTypes: getUniqArray(
        existingBuyer.legalTypes,
        normalizedBuyer.legalTypes,
      ),
      mainActivities: getUniqArray(
        existingBuyer.mainActivities,
        normalizedBuyer.mainActivities,
      ),
      profiles: getUniqArray(existingBuyer.profiles, normalizedBuyer.profiles),
      gateways: getUniqArray(existingBuyer.gateways, normalizedBuyer.gateways),
      websites: getUniqArray(existingBuyer.websites, normalizedBuyer.websites),
      cpvCodes: getUniqArray(existingBuyer.cpvCodes, normalizedBuyer.cpvCodes),
      countries: getUniqArray(
        existingBuyer.countries,
        normalizedBuyer.countries,
      ),
    });

    return existingBuyer.save();
  }
}
