import { Injectable } from '@nestjs/common';
import { GeneralTenderAnalysisInput } from '@/openai/dto/openai-analysis.dto';
import { TenderDocument } from '../tenders/schemas';
import { isRecord } from '@/utils';
import { BaseAnalysisBuilder } from '@/analysis-builder/base-analysis.builder';

@Injectable()
export class TenderGeneralAnalysisBuilder extends BaseAnalysisBuilder {
  async buildAnalysisInput(
    tender: TenderDocument,
  ): Promise<GeneralTenderAnalysisInput> {
    const documents = await this.buildAnalysisDocuments(tender, ['xml']);

    return {
      tender: {
        id: tender.id,
        sourceNoticeId: tender.sourceNoticeId ?? null,
        publicationNumber: tender.publicationNumber ?? null,
        title: tender.title ?? null,
        procedureTitle: tender.titleProc ?? null,
        lotTitles: tender.titleLot ?? [],
        description: tender.description ?? null,
        lotDescriptions: tender.descriptionLot ?? [],
        buyerName: tender.buyerName ?? null,
        buyerIdentifier: tender.buyerIdentifier ?? null,
        country: tender.buyerCountry ?? null,
        buyerCity: tender.buyerCity ?? null,
        buyerEmail: tender.buyerEmail ?? null,
        buyerWebsite: tender.buyerInternetAddress ?? null,
        buyerProfileUrl: tender.buyerProfile ?? null,
        procedureType: tender.procedureType ?? null,
        noticeType: tender.noticeType ?? null,
        noticeSubtype: tender.noticeSubtype ?? null,
        noticeVersion: tender.noticeVersion ?? null,
        publicationDate: this.formatDate(tender.publicationDate),
        dispatchDate: this.formatDate(tender.dispatchDate),
        deadlineDate: this.formatDate(tender.submissionDeadline),
        submissionDeadlineFallback: this.formatDate(tender.submissionDeadline),
        questionsDeadline: this.formatDate(tender.questionsDeadline),
        plannedStartDate: this.formatDate(tender.plannedStartDate),
        plannedEndDate: this.formatDate(tender.plannedEndDate),
        duration: {
          value: tender.durationPeriodValue ?? null,
          unit: tender.durationPeriodUnit ?? null,
        },
        contractNature: tender.contractNature ?? null,
        legalBasis: tender.legalBasis ?? null,
        cpvCodes: this.extractCpvCodes(tender),
        mainCpv: this.extractCpvCodeList(tender.mainClassificationProc),
        lotMainCpvs: this.extractCpvCodeList(tender.mainClassificationLot),
        lotAdditionalCpvs: this.extractCpvCodeList(
          tender.additionalClassificationLot,
        ),
        estimatedValue: tender.estimatedValue
          ? {
              amount: tender.estimatedValue.amount,
              currency: tender.estimatedValue.currency,
            }
          : null,
        placeOfPerformance: {
          countries: tender.placeOfPerformanceCountries ?? [],
          cities: tender.placeOfPerformanceCities ?? [],
        },
        lotIdentifiers: tender.lotIdentifiers ?? [],
        internalLotIdentifiers: tender.internalLotIdentifiers ?? [],
        documentUrls: tender.documentUrls ?? [],
        submissionUrls: tender.submissionUrls ?? [],
        flags: {
          isDps: tender.isDps,
          isFrameworkAgreement: tender.isFrameworkAgreement,
          isSmeSuitable: tender.isSmeSuitable,
          isEuFunded: tender.euFundLot,
          electronicSubmission: tender.electronicSubmission ?? null,
        },
        selectionCriteria: tender.selectionCriteria ?? [],
        awardCriteria: tender.awardCriteria ?? [],
        languages: tender.submissionLanguages ?? [],
      },
      documents,
    };
  }

  private formatDate(value: Date | undefined): string | null {
    return value?.toISOString() ?? null;
  }

  private extractCpvCodes(tender: TenderDocument): string[] {
    const codes = [
      ...(tender.cpvCodes ?? []),
      ...(tender.classificationCpv ?? []),
    ]
      .map((cpv) => this.extractCpvCode(cpv))
      .filter((code): code is string => code !== null);

    return Array.from(new Set(codes));
  }

  private extractCpvCodeList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((cpv) => this.extractCpvCode(cpv))
      .filter((code): code is string => code !== null);
  }

  private extractCpvCode(cpv: unknown): string | null {
    if (typeof cpv === 'string') {
      return cpv;
    }

    if (!isRecord(cpv)) {
      return null;
    }

    return typeof cpv.code === 'string' ? cpv.code : null;
  }
}
