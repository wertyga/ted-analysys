import { Injectable } from '@nestjs/common';
import {
  GeneralTenderAnalysisBuyerInput,
  GeneralTenderAnalysisInput,
} from '@/openai/dto/openai-analysis.dto';
import { TenderDocument, TenderLot } from '../tenders/schemas';
import { isRecord } from '@/utils';
import { DocumentExtractor } from '@/document-extractor';
import { Buyer, BuyerDocument } from '@/resources/buyer/schemas';

@Injectable()
export class TenderGeneralAnalysisBuilder {
  private readonly documentExtractor = new DocumentExtractor();

  async buildAnalysisInput(
    tender: TenderDocument,
  ): Promise<GeneralTenderAnalysisInput> {
    const documents = await this.documentExtractor.buildAnalysisDocuments(
      tender,
      ['xml'],
    );

    const leadBuyers = tender.leadBuyers.flatMap((buyer) =>
      this.buildBuyerInput(buyer),
    );
    const nonLeadBuyers = tender.nonLeadBuyers.flatMap((buyer) =>
      this.buildBuyerInput(buyer),
    );

    return {
      tender: {
        id: tender.id,
        title: tender.title ?? null,
        procedureTitle: tender.titleProc ?? null,
        description: tender.description ?? null,
        lots: tender.lots ?? [],
        leadBuyers,
        nonLeadBuyers,
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
        duration: tender.duration
          ? {
              value: tender.duration.value ?? null,
              unit: tender.duration.unit ?? null,
            }
          : undefined,
        contractNature: tender.contractNature ?? null,
        legalBasis: tender.legalBasis ?? null,
        cpvCodes: this.extractCpvCodes(tender),
        mainCpv: this.extractCpvCodeList(tender.mainClassificationProc),
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

  buildBuyerInput(
    buyer: string | BuyerDocument | Buyer | unknown,
  ): GeneralTenderAnalysisBuyerInput[] {
    if (!isRecord(buyer)) {
      return [];
    }

    return [
      {
        name: typeof buyer.name === 'string' ? buyer.name : undefined,
        identifiers: Array.isArray(buyer.identifiers)
          ? buyer.identifiers.filter(
              (identifier): identifier is string =>
                typeof identifier === 'string' && identifier.trim().length > 0,
            )
          : [],
        contact: isRecord(buyer.contact)
          ? {
              contactPoint: this.getOptionalString(buyer.contact.contactPoint),
              person: this.getOptionalString(buyer.contact.person),
              email: this.getOptionalString(buyer.contact.email),
              phone: this.getOptionalString(buyer.contact.phone),
              website: this.getOptionalString(buyer.contact.website),
              gateway: this.getOptionalString(buyer.contact.gateway),
            }
          : undefined,
        address: isRecord(buyer.address)
          ? {
              street: this.getOptionalString(buyer.address.street),
              postCode: this.getOptionalString(buyer.address.postCode),
              city: this.getOptionalString(buyer.address.city),
              country: this.getOptionalString(buyer.address.country),
              countrySub: this.getOptionalString(buyer.address.countrySub),
            }
          : undefined,
        legalTypes: Array.isArray(buyer.legalTypes) ? buyer.legalTypes : [],
        mainActivities: Array.isArray(buyer.mainActivities)
          ? buyer.mainActivities
          : [],
        profiles: this.getStringArray(buyer.profiles),
        websites: this.getStringArray(buyer.websites),
      },
    ];
  }

  private getOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private getStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      : [];
  }

  private buildLotInput(lot: TenderLot) {
    return {
      ...lot,
      deadlineReceiptTender: this.formatDate(lot.deadlineReceiptTender),
    };
  }

  private extractCpvCodes(tender: TenderDocument): string[] {
    const codes = [...(tender.cpvCodes ?? [])]
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
