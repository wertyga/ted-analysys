import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import {
  getArrayFallbackValueByIndex,
  getArrayFallbackValueByIndexUniqArray,
  getBooleanArrayValue,
  getEngValueOrFirst,
  getStringArrayValue,
  getUniqArray,
} from '@/utils';
import { Buyer } from '@/resources/buyer/schemas';

export type BuyerNormalized = Omit<
  Buyer,
  | '_id'
  | 'createdAt'
  | 'updatedAt'
  | 'stats'
  | 'statsVersion'
  | 'intelligence'
  | 'legalTypes'
  | 'mainActivities'
> & {
  legalTypes: string[];
  mainActivities: string[];
  isLead: boolean;
};

export class BuyerNormalizer {
  private getEngArrayValue(field: string, notice: TedNotice): string[] {
    const value = getEngValueOrFirst(field, notice);
    const values = Array.isArray(value) ? value : [value];

    return values
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeBuyerContacts(
    notice: TedNotice,
  ): BuyerNormalized['contact'][] {
    const data: Record<string, string[]> = {
      organisationContactPointBuyer: getStringArrayValue(
        'organisation-contact-point-buyer',
        notice,
      ),
      buyerContactPoint: getStringArrayValue('buyer-contact-point', notice),
      touchpointContactPointBuyer: getStringArrayValue(
        'touchpoint-contact-point-buyer',
        notice,
      ),
      organisationPersonBuyer: getStringArrayValue(
        'organisation-person-buyer',
        notice,
      ),
      buyerPerson: getStringArrayValue('buyer-person', notice),
      organisationEmailBuyer: getStringArrayValue(
        'organisation-email-buyer',
        notice,
      ),
      buyerEmail: getStringArrayValue('buyer-email', notice),
      touchpointEmailBuyer: getStringArrayValue(
        'touchpoint-email-buyer',
        notice,
      ),
      organisationTelBuyer: getStringArrayValue(
        'organisation-tel-buyer',
        notice,
      ),
      touchpointTelBuyer: getStringArrayValue('touchpoint-tel-buyer', notice),
      organisationFaxBuyer: getStringArrayValue(
        'organisation-fax-buyer',
        notice,
      ),
      touchpointFaxBuyer: getStringArrayValue('touchpoint-fax-buyer', notice),

      touchpointInternetAddressBuyer: getStringArrayValue(
        'touchpoint-internet-address-buyer',
        notice,
      ),

      touchpointGatewayBuyer: getStringArrayValue(
        'touchpoint-gateway-buyer',
        notice,
      ),
    };

    const length = Math.max(...Object.values(data).map((v) => v.length), 0);

    if (length === 0) {
      return [];
    }

    return Array.from({ length }).map(
      (_, index) =>
        ({
          contactPoint: getArrayFallbackValueByIndex(
            data,
            index,
            'buyerContactPoint',
            'touchpointContactPointBuyer',
          ),
          person: getArrayFallbackValueByIndex(
            data,
            index,
            'buyerPerson',
            'organisationPersonBuyer',
          ),
          email: getArrayFallbackValueByIndex(
            data,
            index,
            'buyerEmail',
            'organisationEmailBuyer',
            'touchpointEmailBuyer',
          ),
          phone: getArrayFallbackValueByIndex(
            data,
            index,
            'organisationTelBuyer',
            'touchpointTelBuyer',
          ),
          fax: getArrayFallbackValueByIndex(
            data,
            index,
            'organisationFaxBuyer',
            'touchpointFaxBuyer',
          ),
          website: getArrayFallbackValueByIndex(
            data,
            index,
            'touchpointInternetAddressBuyer',
          ),
          gateway: getArrayFallbackValueByIndex(
            data,
            index,
            'touchpointGatewayBuyer',
          ),
        }) as BuyerNormalized['contact'],
    );
  }

  private normalizeBuyerAddresses(
    notice: TedNotice,
  ): BuyerNormalized['address'][] {
    const data: Record<string, (string | undefined)[]> = {
      organisationStreetBuyer: getStringArrayValue(
        'organisation-street-buyer',
        notice,
      ),
      organisationPostCodeBuyer: getStringArrayValue(
        'organisation-post-code-buyer',
        notice,
      ),
      organisationCityBuyer: getStringArrayValue(
        'organisation-city-buyer',
        notice,
      ),
      organisationCountryBuyer: getStringArrayValue(
        'organisation-country-buyer',
        notice,
      ),
      organisationCountrySubBuyer: getStringArrayValue(
        'organisation-country-sub-buyer',
        notice,
      ),
      touchpointStreetBuyer: getStringArrayValue(
        'touchpoint-street-buyer',
        notice,
      ),
      touchpointPostCodeBuyer: getStringArrayValue(
        'touchpoint-post-code-buyer',
        notice,
      ),
      touchpointCityBuyer: getStringArrayValue('touchpoint-city-buyer', notice),
      touchpointCountryBuyer: getStringArrayValue(
        'touchpoint-country-buyer',
        notice,
      ),
      touchpointCountrySubBuyer: getStringArrayValue(
        'touchpoint-country-sub-buyer',
        notice,
      ),
      buyerCity: getEngValueOrFirst('buyer-city', notice),
      buyerCountry: getStringArrayValue('buyer-country', notice),
      buyerCountrySub: getStringArrayValue('buyer-country-sub', notice),
      buyerPostCode: getStringArrayValue('buyer-post-code', notice),
    };

    const length = Math.max(...Object.values(data).map((v) => v?.length ?? 0));

    if (length === 0) {
      return [];
    }

    return Array.from(new Array(length)).map((_, index) => {
      return {
        street: getArrayFallbackValueByIndex(
          data,
          index,
          'organisationStreetBuyer',
          'touchpointStreetBuyer',
        ),
        postCode: getArrayFallbackValueByIndex(
          data,
          index,
          'buyerPostCode',
          'organisationPostCodeBuyer',
          'touchpointPostCodeBuyer',
        ),
        city: getArrayFallbackValueByIndex(
          data,
          index,
          'buyerCity',
          'organisationCityBuyer',
          'touchpointCityBuyer',
        ),
        country: getArrayFallbackValueByIndex(
          data,
          index,
          'buyerCountry',
          'organisationCountryBuyer',
          'touchpointCountryBuyer',
        ),
        countrySub: getArrayFallbackValueByIndex(
          data,
          index,
          'buyerCountrySub',
          'organisationCountrySubBuyer',
          'touchpointCountrySubBuyer',
        ),
      } as BuyerNormalized['address'];
    });
  }

  normalizeBuyersFromTEDNotice(notice: TedNotice): BuyerNormalized[] {
    const data = {
      organisationGatewayBuyer: getStringArrayValue(
        'organisation-gateway-buyer',
        notice,
      ),
      buyerGroupLeads: getBooleanArrayValue('buyer-group-lead', notice),
      buyerGateway: getStringArrayValue('buyer-gateway', notice),
      organisationInternetAddressBuyer: getStringArrayValue(
        'organisation-internet-address-buyer',
        notice,
      ),
      touchpointInternetAddressBuyer: getStringArrayValue(
        'touchpoint-internet-address-buyer',
        notice,
      ),
      buyerInternetAddress: getStringArrayValue(
        'buyer-internet-address',
        notice,
      ),
      organisationNameBuyer: this.getEngArrayValue(
        'organisation-name-buyer',
        notice,
      ),
      touchpointNameBuyer: this.getEngArrayValue(
        'touchpoint-name-buyer',
        notice,
      ),
      buyerName: this.getEngArrayValue('buyer-name', notice),

      organisationIdentifierBuyer: getStringArrayValue(
        'organisation-identifier-buyer',
        notice,
      ),
      buyerIdentifiers: getStringArrayValue('buyer-identifier', notice),

      buyerLegalType: getStringArrayValue('buyer-legal-type', notice),
      bt11ProcedureBuyer: getStringArrayValue('BT-11-Procedure-Buyer', notice),

      mainActivity: getStringArrayValue('main-activity', notice),
      authorityMainActivity: getStringArrayValue(
        'authority-main-activity',
        notice,
      ),
      entityMainActivity: getStringArrayValue('entity-main-activity', notice),
      activitySector: getStringArrayValue('activity-sector', notice),

      bt10ProcedureBuyer: getStringArrayValue('BT-10-Procedure-Buyer', notice),

      buyerProfile: getStringArrayValue('buyer-profile', notice),
      bt508ProcedureBuyer: getStringArrayValue(
        'BT-508-Procedure-Buyer',
        notice,
      ),

      acquiringCpbBuyer: getStringArrayValue('acquiring-cpb-buyer', notice),

      placeOfPerformanceCountryProc: getStringArrayValue(
        'place-of-performance-country-proc',
        notice,
      ),
      placeOfPerformanceCountryLot: getStringArrayValue(
        'place-of-performance-country-lot',
        notice,
      ),

      classificationsCpv: getStringArrayValue('classification-cpv', notice),
      mainClassificationsProc: getStringArrayValue(
        'main-classification-proc',
        notice,
      ),
      mainClassificationsLot: getStringArrayValue(
        'main-classification-lot',
        notice,
      ),
    };

    const addresses = this.normalizeBuyerAddresses(notice);
    const contacts = this.normalizeBuyerContacts(notice);

    const length = Math.max(
      data.buyerName.length,
      data.organisationNameBuyer.length,
      data.touchpointNameBuyer.length,
      addresses.length,
      contacts.length,
      0,
    );

    if (length === 0) {
      return [];
    }

    const hasALead = !!data.buyerGroupLeads?.find((l) => !!l);

    return Array.from({ length })
      .map((_, index) => {
        return {
          isLead: hasALead
            ? !!getArrayFallbackValueByIndex(data, index, 'buyerGroupLeads')
            : true,
          name: getArrayFallbackValueByIndex(
            data,
            index,
            'buyerName',
            'organisationNameBuyer',
            'touchpointNameBuyer',
          ),
          contact: contacts[index] ?? {},
          address: addresses[index] ?? {},
          profiles: getArrayFallbackValueByIndexUniqArray(
            data,
            index,
            'buyerProfile',
            'bt508ProcedureBuyer',
          ),
          websites: getArrayFallbackValueByIndexUniqArray(
            data,
            index,
            'buyerInternetAddress',
            'organisationInternetAddressBuyer',
            'touchpointInternetAddressBuyer',
          ),
          gateways: getArrayFallbackValueByIndexUniqArray(
            data,
            index,
            'buyerGateway',
            'organisationGatewayBuyer',
          ),
          identifiers: getArrayFallbackValueByIndexUniqArray(
            data,
            index,
            'buyerIdentifiers',
            'organisationIdentifierBuyer',
          ),

          legalTypes: getArrayFallbackValueByIndexUniqArray(
            data,
            index,
            'buyerLegalType',
            'bt11ProcedureBuyer',
          ),
          countries: getUniqArray(
            data.placeOfPerformanceCountryProc,
            data.placeOfPerformanceCountryLot,
          ),

          cpvCodes: getUniqArray(
            data.classificationsCpv,
            data.mainClassificationsProc,
            data.mainClassificationsLot,
          ),

          mainActivities: getArrayFallbackValueByIndexUniqArray(
            data,
            index,
            'mainActivity',
            'authorityMainActivity',
            'entityMainActivity',
            'activitySector',
            'bt10ProcedureBuyer',
          ),
        };
      })
      .filter((b) => !!b.name);
  }
}
