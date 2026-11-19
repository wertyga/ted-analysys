import { NATIONAL_TENDER_MODEL_NAME } from '@/resources/national-tenders/core/national-tender.serializer';
import { NationalTenderModel } from '@/resources/national-tenders/core/schemas/national-tender.schema';
import {
  TenderDeepAnalysisDocument,
  TenderDeepAnalysisRecord,
} from '@/resources/tender-deep-analysis/schemas';
import { isPopulatedRecord } from '@/utils';
import { TenderDocument, TenderModel } from '@/resources/tenders/schemas';
import {
  TenderGeneralAnalysisModel,
  TenderGeneralAnalysisRecord,
} from '@/resources/tender-analysis/schemas';
import { CompanyTenderFilterModel } from '@/resources/company-filter/company-filter.schema';

export async function getTenderSourceHash(
  deepAnalysis: TenderDeepAnalysisDocument | TenderDeepAnalysisRecord,
): Promise<string | undefined> {
  if (!deepAnalysis.tender) {
    return undefined;
  }

  if (isPopulatedRecord(deepAnalysis.tender)) {
    return (deepAnalysis.tender as any).sourceHash;
  }

  const model =
    deepAnalysis.tenderModel === NATIONAL_TENDER_MODEL_NAME
      ? NationalTenderModel
      : TenderModel;
  const tenderRecord = await (model as typeof TenderModel)
    .findById(deepAnalysis.tender)
    .select('sourceHash')
    .lean<Pick<TenderDocument, 'sourceHash'>>()
    .exec();

  return tenderRecord?.sourceHash;
}

export async function getGeneralAnalysisSourceHash(
  deepAnalysis: TenderDeepAnalysisDocument | TenderDeepAnalysisRecord,
): Promise<string | undefined> {
  const generalAnalysis = deepAnalysis.generalAnalysis;

  if (isPopulatedRecord(generalAnalysis)) {
    return (generalAnalysis as any).sourceHash;
  }

  if (!generalAnalysis) {
    return undefined;
  }

  const generalAnalysisRecord = await TenderGeneralAnalysisModel.findById(
    generalAnalysis,
  )
    .select('sourceHash')
    .lean<Pick<TenderGeneralAnalysisRecord, 'sourceHash'>>()
    .exec();

  return generalAnalysisRecord?.sourceHash;
}

export async function getCompanyAnalysisSourceHash(
  deepAnalysis: TenderDeepAnalysisDocument | TenderDeepAnalysisRecord,
): Promise<string | undefined> {
  const companyId = isPopulatedRecord(deepAnalysis.company)
    ? deepAnalysis.company._id
    : deepAnalysis.company;

  if (!companyId) {
    return undefined;
  }

  const companyAnalysis = await CompanyTenderFilterModel.findOne({
    user: companyId,
  })
    .select('sourceHash')
    .lean<{ sourceHash?: string }>()
    .exec();

  return companyAnalysis?.sourceHash;
}

export function normalizeDeepAnalysisLanguage(language?: string): string {
  const normalized = language?.trim();

  return normalized && normalized.length > 0 ? normalized : 'en';
}
