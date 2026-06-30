import { Injectable } from '@nestjs/common';
import {
  TenderDeepAnalysisResult,
  TenderDeepCompanyFitAnalysisInput,
} from '@/types';
import { TenderDocument } from '../tenders/schemas';
import { CompanyTenderFilterDocument } from '@/resources/company-filter/company-filter.schema';
import { TenderGeneralAnalysisDocument } from '../tender-analysis/schemas';
import { BuyerModel } from '@/resources/buyer/schemas';

@Injectable()
export class TenderDeepAnalysisBuilder {
  buildCompanyAnalysisDto(company: any, companyDocumentEvidence: any): any {
    return {
      companyName: company.companyName,
      country: company.country,
      operatingCountries: company.operatingCountries || [],
      companySize: company.companySize,
      companyDescription: company.companyDescription,
      industries: company.industries || [],
      mainServices: company.mainServices || [],
      languages: company.languages || [],
      certifications: company.certifications || [],
      capabilities: company.capabilities || [],
      yearsOfExperience: company.yearsOfExperience,
      publicProcurementExperience: company.publicProcurementExperience,
      typicalContractSize: company.typicalContractSize,
      companyDocumentEvidence,
    };
  }

  buildInput(params: {
    tender: TenderDocument;
    generalAnalysis: TenderGeneralAnalysisDocument;
    company: any;
    companyAnalysis: CompanyTenderFilterDocument;
    documentMetadata: any[];
    documentTextSnippets: any[];
    outputLanguage: string;
  }): TenderDeepCompanyFitAnalysisInput {
    // Derived metadata calculations
    const now = new Date();
    const deadline = params.tender.submissionDeadline
      ? new Date(params.tender.submissionDeadline)
      : null;
    const daysBeforeDeadline = deadline
      ? Math.max(
          0,
          Math.ceil(
            (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
      : null;
    const derived = {
      daysBeforeDeadline,
      tenderValueEur: params.tender.estimatedValueEur || null,
      isExpired: deadline ? deadline.getTime() < now.getTime() : false,
    } as any;

    return {
      tender: {
        ...params.tender,
        leadBuyers: params.tender.leadBuyers.map(BuyerModel.serializeDetail),
        nonLeadBuyers: params.tender.nonLeadBuyers.map(
          BuyerModel.serializeDetail,
        ),
      },
      generalAnalysis: params.generalAnalysis,
      company: params.company,
      companyAnalysis: params.companyAnalysis,
      derived,
      documentMetadata: params.documentMetadata,
      documentTextSnippets: params.documentTextSnippets,
      outputLanguage: params.outputLanguage,
    };
  }

  normalizeResult(
    result: TenderDeepAnalysisResult,
    _input: TenderDeepCompanyFitAnalysisInput,
  ): TenderDeepAnalysisResult {
    return result;
  }
}
