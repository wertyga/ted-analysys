import { XMLParser } from 'fast-xml-parser';
import { Tender } from '@/resources/tenders/schemas';
import { fetchXmlContentFromNotice } from '@/resources/tender-normalizer/tender-normalizer-xml';

export type LotWinnerResult = {
  lotId: string | null;
  resultId: string | null;
  lotTenderId: string | null;
  tenderingPartyId: string | null;
  winnerOrgId: string | null;

  winner: {
    identifier: string | null;
    name: string | null;
    email: string | null;
    website: string | null;
    country: string | null;
    city: string | null;
    postCode: string | null;
    street: string | null;
    size: string | null;
  };

  awardValue: number | null;
  awardCurrency: string | null;
};

const arr = <T>(value: T | T[] | null | undefined): T[] => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

const first = <T>(value: T | T[] | null | undefined): T | null => {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
};

const text = (value: any): string | null => {
  if (value == null) return null;

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'object' && '#text' in value) {
    return String(value['#text']);
  }

  return null;
};

const getId = (node: any): string | null => {
  return text(node?.['cbc:ID'] ?? node?.ID);
};

const getEformsExtension = (root: any): any | null => {
  const extensions = arr<any>(
    root?.['ext:UBLExtensions']?.['ext:UBLExtension'],
  );

  for (const extension of extensions) {
    const eformsExtension =
      extension?.['ext:ExtensionContent']?.['efext:EformsExtension'];

    if (eformsExtension) {
      return eformsExtension;
    }
  }

  return null;
};

const getRoot = (doc: any): any | null => {
  return (
    doc?.ContractAwardNotice ??
    doc?.ContractNotice ??
    doc?.PriorInformationNotice ??
    doc?.PlanningNotice ??
    Object.entries(doc).find(([key]) => !key.startsWith('?'))?.[1] ??
    null
  );
};

const getAwardAmount = (
  lotTender: any,
): { value: number | null; currency: string | null } => {
  const amount =
    lotTender?.['cac:LegalMonetaryTotal']?.['cbc:PayableAmount'] ??
    lotTender?.['cac:LegalMonetaryTotal']?.['cbc:LineExtensionAmount'];

  const rawValue = text(amount);

  return {
    value: rawValue != null ? Number(rawValue) : null,
    currency: amount?.['@_currencyID'] ?? null,
  };
};

export async function extractLotWinnersFromXml(
  links: Tender['links'],
): Promise<LotWinnerResult[]> {
  const xml = await fetchXmlContentFromNotice(links);

  if (!xml) {
    return [];
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: false,
  });

  const doc = parser.parse(xml);

  const root = getRoot(doc);

  if (!root) {
    return [];
  }

  const eformsExtension = getEformsExtension(root);

  if (!eformsExtension) {
    return [];
  }

  const noticeResult = eformsExtension?.['efac:NoticeResult'];

  if (!noticeResult) {
    return [];
  }

  const lotResults = arr<any>(noticeResult?.['efac:LotResult']);
  const lotTenders = arr<any>(noticeResult?.['efac:LotTender']);
  const tenderingParties = arr<any>(noticeResult?.['efac:TenderingParty']);

  const organizations = arr<any>(
    eformsExtension?.['efac:Organizations']?.['efac:Organization'],
  );

  const lotTenderById = new Map<string, any>();

  for (const lotTender of lotTenders) {
    const id = getId(lotTender);

    if (id) {
      lotTenderById.set(id, lotTender);
    }
  }

  const tenderingPartyById = new Map<string, any>();

  for (const tenderingParty of tenderingParties) {
    const id = getId(tenderingParty);

    if (id) {
      tenderingPartyById.set(id, tenderingParty);
    }
  }

  const organizationById = new Map<string, any>();

  for (const organization of organizations) {
    const company = organization?.['efac:Company'];

    const orgId =
      getId(company?.['cac:PartyIdentification']) ??
      getId(first(arr<any>(company?.['cac:PartyIdentification'])));

    if (orgId) {
      organizationById.set(orgId, organization);
    }
  }

  return lotResults.map((lotResult): LotWinnerResult => {
    const resultId = getId(lotResult);
    const lotId = getId(lotResult?.['efac:TenderLot']);

    const lotTenderId = getId(lotResult?.['efac:LotTender']);
    const lotTender = lotTenderId ? lotTenderById.get(lotTenderId) : null;

    const tenderingPartyId = getId(lotTender?.['efac:TenderingParty']);
    const tenderingParty = tenderingPartyId
      ? tenderingPartyById.get(tenderingPartyId)
      : null;

    const winnerOrgId = getId(tenderingParty?.['efac:Tenderer']);
    const organization = winnerOrgId ? organizationById.get(winnerOrgId) : null;

    const company = organization?.['efac:Company'];
    const address = company?.['cac:PostalAddress'];
    const contact = company?.['cac:Contact'];
    const legalEntity = first(arr<any>(company?.['cac:PartyLegalEntity']));

    const { value: awardValue, currency: awardCurrency } =
      getAwardAmount(lotTender);

    return {
      lotId,
      resultId,
      lotTenderId,
      tenderingPartyId,
      winnerOrgId,

      winner: {
        identifier: text(legalEntity?.['cbc:CompanyID']),
        name: text(company?.['cac:PartyName']?.['cbc:Name']),
        email: text(contact?.['cbc:ElectronicMail']),
        website: text(company?.['cbc:WebsiteURI']),
        country: text(address?.['cac:Country']?.['cbc:IdentificationCode']),
        city: text(address?.['cbc:CityName']),
        postCode: text(address?.['cbc:PostalZone']),
        street: text(address?.['cbc:StreetName']),
        size: text(company?.['cbc:CompanySizeCode']),
      },

      awardValue,
      awardCurrency,
    };
  });
}
