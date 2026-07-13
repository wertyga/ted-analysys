import { Injectable } from '@nestjs/common';
import {
  TenderDeepAnalysisResult,
  TenderAnalysisTenderDto,
  TenderDeepBuyerIntelligenceInput,
  TenderDeepCompanyFitAnalysisInput,
} from '@/types';
import { TenderDocument } from '../tenders/schemas';
import { CompanyTenderFilterDocument } from '@/resources/company-filter/company-filter.schema';
import { TenderGeneralAnalysisDocument } from '../tender-analysis/schemas';
import { TenderGeneralAnalysisBuilder } from '@/resources/tender-analysis/tender-general-analysis.builder';

@Injectable()
export class TenderDeepAnalysisBuilder {
  constructor(
    private readonly generalAnalysisBuilder: TenderGeneralAnalysisBuilder,
  ) {}

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
    buyerIntelligence: TenderDeepBuyerIntelligenceInput[];
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
      tender: this.buildTenderInput(params.tender),
      generalAnalysis: params.generalAnalysis,
      company: params.company,
      companyAnalysis: params.companyAnalysis,
      buyerIntelligence: params.buyerIntelligence,
      derived,
      documentMetadata: params.documentMetadata,
      documentTextSnippets: params.documentTextSnippets,
      outputLanguage: params.outputLanguage,
    };
  }

  private buildTenderInput(tender: TenderDocument): TenderAnalysisTenderDto {
    return {
      id: tender.id,
      noticeType: tender.noticeType,
      noticeSubtype: tender.noticeSubtype,
      noticeVersion: tender.noticeVersion,
      procedureType: tender.procedureType,
      title: tender.title,
      titleProc: tender.titleProc,
      description: tender.description,
      lots: tender.lots ?? [],
      estimatedValue: tender.estimatedValue,
      noticeLanguage: tender.noticeLanguage,
      submissionLanguages: tender.submissionLanguages,
      leadBuyers: tender.leadBuyers.flatMap((buyer) =>
        this.generalAnalysisBuilder.buildBuyerInput(buyer),
      ),
      nonLeadBuyers: tender.nonLeadBuyers.flatMap((buyer) =>
        this.generalAnalysisBuilder.buildBuyerInput(buyer),
      ),
      publicationDate: tender.publicationDate,
      dispatchDate: tender.dispatchDate,
      submissionDeadline: tender.submissionDeadline,
      questionsDeadline: tender.questionsDeadline,
      plannedStartDate: tender.plannedStartDate,
      plannedEndDate: tender.plannedEndDate,
      duration: tender.duration,
      contractNature: tender.contractNature,
      legalBasis: tender.legalBasis,
      electronicSubmission: tender.electronicSubmission,
      cpvCodes: this.generalAnalysisBuilder.resolveCpvCodesForPrompt(
        tender.cpvCodes ?? [],
      ),
      placeOfPerformanceCountries: tender.placeOfPerformanceCountries,
      placeOfPerformanceCities: tender.placeOfPerformanceCities,
      documentUrls: tender.documentUrls,
      submissionUrls: tender.submissionUrls,
      euFundLot: tender.euFundLot,
      selectionCriteria: tender.selectionCriteria,
      links: tender.links,
    };
  }

  normalizeResult(
    result: TenderDeepAnalysisResult,
    _input: TenderDeepCompanyFitAnalysisInput,
  ): TenderDeepAnalysisResult {
    return result;
  }
}
