import { Injectable } from '@nestjs/common';
import { BuyerNormalizer } from './buyer.normalizer';
import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import { BuyerModel } from './schemas';
import { getUniqArray } from '@/utils';

@Injectable()
export class BuyerService {
  normalizer = new BuyerNormalizer();

  async upsertBuyerFromTEDNotice(notice: TedNotice) {
    const normalizedBuyer = this.normalizer.normalizeBuyerFromTEDNotice(notice);

    const identityFilter =
      normalizedBuyer.organisationIdentifierBuyer &&
      normalizedBuyer.buyerCountry
        ? {
            organisationIdentifierBuyer:
              normalizedBuyer.organisationIdentifierBuyer,
            buyerCountry: normalizedBuyer.buyerCountry,
          }
        : {
            name: normalizedBuyer.name,
            buyerCountry: normalizedBuyer.buyerCountry,
          };

    const existingBuyer = await BuyerModel.findOne(identityFilter);

    if (!existingBuyer) {
      return BuyerModel.create(normalizedBuyer);
    }

    const getLastExisting = (...values: Array<string | null | undefined>) =>
      values.findLast((value) => value?.trim()) ?? '';

    existingBuyer.set({
      name: getLastExisting(existingBuyer.name, normalizedBuyer.name),
      organisationIdentifierBuyer: getLastExisting(
        existingBuyer.organisationIdentifierBuyer,
        normalizedBuyer.organisationIdentifierBuyer,
      ),
      buyerCountry: getLastExisting(
        existingBuyer.buyerCountry,
        normalizedBuyer.buyerCountry,
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
        url: getLastExisting(
          existingBuyer.contact?.url,
          normalizedBuyer.contact.url,
        ),
        gateway: getLastExisting(
          existingBuyer.contact?.gateway,
          normalizedBuyer.contact.gateway,
        ),
      },
      address: {
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
      },
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
      profiles: getUniqArray(
        existingBuyer.profiles,
        normalizedBuyer.profiles,
      ),
      gateways: getUniqArray(
        existingBuyer.gateways,
        normalizedBuyer.gateways,
      ),
      websites: getUniqArray(
        existingBuyer.websites,
        normalizedBuyer.websites,
      ),
      cpvCodes: getUniqArray(
        existingBuyer.cpvCodes,
        normalizedBuyer.cpvCodes,
      ),
      countries: getUniqArray(
        existingBuyer.countries,
        normalizedBuyer.countries,
      ),
    });

    return existingBuyer.save();
  }
}
