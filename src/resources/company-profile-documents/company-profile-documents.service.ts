import { BadRequestException, Injectable } from '@nestjs/common';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import {
  TenderDocumentTextExtractorService,
  TenderSourceDocumentType,
} from '@/resources/tenders/tender-document-text-extractor.service';
import {
  getCpvCodeArray,
  getNormalizedStringArray,
  getOptionalNonNegativeNumber,
  getOptionalPositiveNumber,
  getOptionalString,
  isRecord,
} from '@/utils';
import { CpvService } from '@/resources/cpv/cpv.service';
import { CurrencySign } from '@/resources/codelist';
import { COMPANY_PROFILE_DOCUMENT_SYSTEM_PROMPT } from './company-profile-documents.prompt';
import {
  CompanyProfileAiResult,
  CompanyProfileDocumentFile,
  CompanyProfileDocumentUploadResult,
} from './company-profile-documents.types';

const MAX_DOCUMENTS = 10;
const MAX_CONTEXT_CHARS = 80_000;

@Injectable()
export class CompanyProfileDocumentsService {
  constructor(
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
    private readonly textExtractor: TenderDocumentTextExtractorService,
    private readonly cpvService: CpvService,
  ) {}

  async uploadAndExtractProfile(
    files: CompanyProfileDocumentFile[],
  ): Promise<CompanyProfileDocumentUploadResult> {
    if (!files?.length) {
      throw new BadRequestException('At least one document is required');
    }

    if (files.length > MAX_DOCUMENTS) {
      throw new BadRequestException(
        `At most ${MAX_DOCUMENTS} documents allowed`,
      );
    }

    const extractedDocuments = await Promise.all(
      files.map((file) => this.extractDocument(file)),
    );

    const aiResult = await this.extractProfileWithAi(extractedDocuments);

    const profile = this.normalizeProfile(aiResult);

    const [industries, mainServices] = await Promise.all([
      this.cpvService.resolveCodeIds(profile.industries ?? []),
      this.cpvService.resolveCodeIds(profile.mainServices ?? []),
    ]);

    return {
      profile,
      resolvedProfile: {
        ...profile,
        industries,
        mainServices,
      },
      documents: extractedDocuments.map(({ file, extraction }) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        textHash: extraction.textHash,
        contentLength: extraction.contentLength,
        warnings: extraction.warnings,
      })),
    };
  }

  private async extractProfileWithAi(
    documents: Array<{
      file: CompanyProfileDocumentFile;
      extraction: { aiText: string };
    }>,
  ): Promise<unknown> {
    const context = documents
      .map(({ file, extraction }, index) => {
        return [
          `Document ${index + 1}: ${file.originalname}`,
          `MIME type: ${file.mimetype || 'unknown'}`,
          '',
          extraction.aiText,
        ].join('\n');
      })
      .join('\n\n---\n\n')
      .slice(0, MAX_CONTEXT_CHARS);

    return this.deepSeekAnalysisService.createGeneralJsonResponse(
      COMPANY_PROFILE_DOCUMENT_SYSTEM_PROMPT,
      context,
    );
  }

  private async extractDocument(file: CompanyProfileDocumentFile) {
    try {
      const extraction = await this.textExtractor.extractAndPrepareText({
        sourceUrl: file.originalname,
        filename: file.originalname,
        mimeType: file.mimetype,
        documentType: TenderSourceDocumentType.OTHER,
        content: file.buffer,
      });

      return {
        file,
        extraction,
      };
    } catch (error: unknown) {
      throw new BadRequestException({
        message: 'Unsupported or invalid company profile document',
        filename: file.originalname,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  private normalizeProfile(value: unknown): CompanyProfileAiResult {
    if (!isRecord(value)) {
      throw new BadRequestException(
        'AI profile extraction returned invalid JSON',
      );
    }

    return {
      companyName: getOptionalString(value.companyName),
      country: getOptionalString(value.country),
      operatingCountries: getNormalizedStringArray(value.operatingCountries),
      companySize: getOptionalPositiveNumber(value.companySize),
      companyDescription: getOptionalString(value.companyDescription),
      industries: getCpvCodeArray(value.industries),
      mainServices: getCpvCodeArray(value.mainServices),
      languages: getNormalizedStringArray(value.languages).map((item) =>
        item.toUpperCase(),
      ),
      minDaysBeforeDeadline: getOptionalNonNegativeNumber(
        value.minDaysBeforeDeadline,
      ),
      certifications: getNormalizedStringArray(value.certifications),
      capabilities: getNormalizedStringArray(value.capabilities),
      yearsOfExperience: getOptionalNonNegativeNumber(value.yearsOfExperience),
      publicProcurementExperience:
        typeof value.publicProcurementExperience === 'boolean'
          ? value.publicProcurementExperience
          : undefined,
      typicalContractSize: this.typicalContractSize(value.typicalContractSize),
    };
  }

  private typicalContractSize(
    value: unknown,
  ): CompanyProfileAiResult['typicalContractSize'] | undefined {
    if (!isRecord(value)) {
      return undefined;
    }

    const currency =
      typeof value.currency === 'string' &&
      Object.values(CurrencySign).includes(value.currency as CurrencySign)
        ? (value.currency as CurrencySign)
        : undefined;
    const result = {
      min: getOptionalNonNegativeNumber(value.min),
      max: getOptionalNonNegativeNumber(value.max),
      currency,
    };

    return result.min !== undefined ||
      result.max !== undefined ||
      result.currency !== undefined
      ? result
      : undefined;
  }
}
