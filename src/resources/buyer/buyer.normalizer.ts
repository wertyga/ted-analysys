import { TedNotice } from '@/resources/ted-search/types/ted-search.types';
import {
  getArrayValue,
  getEngValueOrFirst,
  getEngValueOrFirstString,
  getStringArrayValue,
  getUniqArray,
} from '@/utils';
import { Buyer, BuyerIdentifierType } from '@/resources/buyer/schemas';

export type BuyerNormalized = Omit<
  Buyer,
  | '_id'
  | 'createdAt'
  | 'updatedAt'
  | 'totalEstimatedValueEur'
  | 'firstPublicationDate'
  | 'lastPublicationDate'
  | 'tenders'
>;

export class BuyerNormalizer {
  private normalizeBuyerContact(notice: TedNotice): BuyerNormalized['contact'] {
    const data = {
      organisationContactPointBuyer: getStringArrayValue(
        'organisation-contact-point-buyer',
        notice,
      ),
      buyerContactPoint: getStringArrayValue('buyer-contact-point', notice),
      touchpointContactPointBuyer: getArrayValue(
        'touchpoint-contact-point-buyer',
        notice,
      ),
      organisationPersonBuyer: getArrayValue(
        'organisation-person-buyer',
        notice,
      ),
      buyerPerson: getArrayValue('buyer-person', notice),
      organisationEmailBuyer: getStringArrayValue(
        'organisation-email-buyer',
        notice,
      ),
      buyerEmail: getStringArrayValue('buyer-email', notice),
      touchpointEmailBuyer: getArrayValue('touchpoint-email-buyer', notice),
      organisationTelBuyer: getStringArrayValue(
        'organisation-tel-buyer',
        notice,
      ),
      touchpointTelBuyer: getArrayValue('touchpoint-tel-buyer', notice),
      organisationFaxBuyer: getArrayValue('organisation-fax-buyer', notice),
      touchpointFaxBuyer: getArrayValue('touchpoint-fax-buyer', notice),

      touchpointInternetAddressBuyer: getArrayValue(
        'touchpoint-internet-address-buyer',
        notice,
      ),

      touchpointGatewayBuyer: getArrayValue('touchpoint-gateway-buyer', notice),
    };

    return {
      contactPoint: getUniqArray(
        data.organisationContactPointBuyer,
        data.buyerContactPoint,
        data.touchpointContactPointBuyer,
      )[0],
      person: getUniqArray(data.organisationPersonBuyer, data.buyerPerson)[0],
      email: getUniqArray(
        data.organisationEmailBuyer,
        data.buyerEmail,
        data.touchpointEmailBuyer,
      )[0],
      phone: getUniqArray(
        data.organisationTelBuyer,
        data.touchpointTelBuyer,
      )[0],
      fax: getUniqArray(data.organisationFaxBuyer, data.touchpointFaxBuyer)[0],
      url: getUniqArray(data.touchpointInternetAddressBuyer)[0],
      gateway: getUniqArray(data.touchpointGatewayBuyer)[0],
    };
  }

  private normalizeBuyerAddress(notice: TedNotice): BuyerNormalized['address'] {
    const data = {
      organisationStreetBuyer: getArrayValue(
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
      buyerCity: getEngValueOrFirst('buyer-city', notice),
      buyerCountry: getStringArrayValue('buyer-country', notice),
      buyerCountrySub: getStringArrayValue('buyer-country-sub', notice),
      buyerPostCode: getStringArrayValue('buyer-post-code', notice),
    };

    return {
      street: getUniqArray(data.organisationStreetBuyer)[0],
      postCode: getUniqArray(
        data.organisationPostCodeBuyer,
        data.buyerPostCode,
      )[0],
      city: getUniqArray(
        data.organisationCityBuyer,
        Array.isArray(data.buyerCity) ? data.buyerCity : [data.buyerCity],
      )[0],
      country: getUniqArray(
        data.organisationCountryBuyer,
        data.buyerCountry,
      )[0],
      countrySub: getUniqArray(
        data.organisationCountrySubBuyer,
        data.buyerCountrySub,
      )[0],
    };
  }

  normalizeBuyerFromTEDNotice(notice: TedNotice): BuyerNormalized {
    const data = {
      organisationGatewayBuyer: getArrayValue(
        'organisation-gateway-buyer',
        notice,
      ),
      buyerGateway: getArrayValue('buyer-gateway', notice),
      organisationInternetAddressBuyer: getArrayValue(
        'organisation-internet-address-buyer',
        notice,
      ),
      buyerInternetAddress: getArrayValue('buyer-internet-address', notice),
      organisationNameBuyer: getEngValueOrFirstString(
        'organisation-name-buyer',
        notice,
      ),
      buyerName: getEngValueOrFirstString('buyer-name', notice),

      organisationIdentifierBuyer: getStringArrayValue(
        'organisation-identifier-buyer',
        notice,
      ),
      buyerIdentifier: getStringArrayValue('buyer-identifier', notice),

      buyerLegalType: getStringArrayValue('buyer-legal-type', notice),
      bt11ProcedureBuyer: getStringArrayValue('BT-11-Procedure-Buyer', notice),

      mainActivity: getStringArrayValue('main-activity', notice),
      authorityMainActivity: getStringArrayValue(
        'authority-main-activity',
        notice,
      ),
      entityMainActivity: getArrayValue('entity-main-activity', notice),
      activitySector: getArrayValue('activity-sector', notice),

      bt10ProcedureBuyer: getStringArrayValue('BT-10-Procedure-Buyer', notice),

      buyerProfile: getStringArrayValue('buyer-profile', notice),
      bt508ProcedureBuyer: getStringArrayValue(
        'BT-508-Procedure-Buyer',
        notice,
      ),

      acquiringCpbBuyer: getArrayValue('acquiring-cpb-buyer', notice),

      placeOfPerformanceCountryProc: getArrayValue(
        'place-of-performance-country-proc',
        notice,
      ),
      placeOfPerformanceCountryLot: getArrayValue(
        'place-of-performance-country-lot',
        notice,
      ),

      classificationCpv: getStringArrayValue('classification-cpv', notice),
      mainClassificationProc: getStringArrayValue(
        'main-classification-proc',
        notice,
      ),
      mainClassificationLot: getStringArrayValue(
        'main-classification-lot',
        notice,
      ),
    };

    const address = this.normalizeBuyerAddress(notice);

    return {
      name: data.buyerName || data.organisationNameBuyer,
      contact: this.normalizeBuyerContact(notice),
      address,
      profiles: getUniqArray(data.buyerProfile, data.bt508ProcedureBuyer),
      websites: getUniqArray(
        data.organisationInternetAddressBuyer,
        data.buyerInternetAddress,
      ),
      gateways: getUniqArray(data.organisationGatewayBuyer, data.buyerGateway),
      identifiers: getUniqArray(
        data.organisationIdentifierBuyer,
        data.buyerIdentifier,
      ).map((value) => ({
        type: BuyerIdentifierType.UNKNOWN,
        value: String(value),
      })),

      organisationIdentifierBuyer: getUniqArray(
        data.organisationIdentifierBuyer,
        data.buyerIdentifier,
      )?.[0],
      // buyerCountry: address.country,

      legalTypes: getUniqArray(data.buyerLegalType, data.bt11ProcedureBuyer),
      countries: getUniqArray(
        data.placeOfPerformanceCountryProc,
        data.placeOfPerformanceCountryLot,
      ),

      cpvCodes: getUniqArray(
        data.classificationCpv,
        data.mainClassificationProc,
        data.mainClassificationLot,
      ),

      mainActivities: getUniqArray(
        data.mainActivity,
        data.authorityMainActivity,
        data.entityMainActivity,
        data.activitySector,
        data.bt10ProcedureBuyer,
      ),
    };
  }
}
