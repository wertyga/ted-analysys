import {
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import {
  TenderDocumentTextExtractorService,
  TenderSourceDocumentType,
} from '@/resources/tender-normalizer/tender-document-text-extractor.service';
import {
  getNormalizedStringArray,
  getOptionalNonNegativeNumber,
  getOptionalString,
  getSafeErrorMessage,
  getEnumOrNull,
  isRecord,
  QueueAsyncConcurrency,
  uniqueFlatMap,
  sleep,
} from '@/utils';
import { CpvService } from '@/resources/cpv/cpv.service';
import { COMPANY_PROFILE_DOCUMENT_SYSTEM_PROMPT } from './company-profile-documents.prompt';
import { normalizeCompanyProfileAiResult } from './company-profile.normalizer';
import {
  COMPANY_PROFILE_DOCUMENT_ANALYSIS_PROMPT_VERSION,
  COMPANY_PROFILE_SINGLE_DOCUMENT_ANALYSIS_PROMPT,
} from './company-profile-documents.prompt';
import {
  CompanyDocumentEvidence,
  CompanyProfileDocumentAnalysisResult,
  CompanyProfileDocumentFile,
  CompanyProfileDocumentUploadResult,
} from './company-profile-documents.types';
import { UserDocument } from '@/resources/user/user.types';
import {
  CompanyProfileDocumentAnalysisDocument,
  CompanyProfileDocumentAnalysisModel,
  CompanyProfileDocumentAnalysisStatus,
  CompanyProfileDocumentType,
} from './schemas';
import { delay } from 'rxjs';
import { COMPANY_PROFILE_DOCUMENTS_CONFIG } from '@/config/company-profile-documents.config';

@Injectable()
export class CompanyProfileDocumentsService {
  private readonly documentAnalysisQueue = new QueueAsyncConcurrency(
    COMPANY_PROFILE_DOCUMENTS_CONFIG.analysis.concurrency,
  );

  constructor(
    private readonly llmAnalysisService: LlmAnalysisService,
    private readonly textExtractor: TenderDocumentTextExtractorService,
    private readonly cpvService: CpvService,
  ) {}

  async getFinishedCompanyDocumentsAnalysis(user: UserDocument) {
    const waitUntil =
      Date.now() + COMPANY_PROFILE_DOCUMENTS_CONFIG.analysis.waitTimeoutMs;

    while (true) {
      const docs = await CompanyProfileDocumentAnalysisModel.find({
        user: user._id,
        status: {
          $in: [
            CompanyProfileDocumentAnalysisStatus.DONE,
            CompanyProfileDocumentAnalysisStatus.PROCESSING,
          ],
        },
      });

      const docsInProcess = docs.filter(
        (doc) => doc.status === CompanyProfileDocumentAnalysisStatus.PROCESSING,
      );

      if (!docsInProcess.length) {
        return docs;
      }

      if (Date.now() >= waitUntil) {
        throw new RequestTimeoutException(
          'Company document analysis was not finished within 10 minutes',
        );
      }

      await sleep(COMPANY_PROFILE_DOCUMENTS_CONFIG.analysis.waitIntervalMs);
    }
  }

  async uploadAndExtractProfile(
    files: CompanyProfileDocumentFile[],
    user: UserDocument,
  ): Promise<CompanyProfileDocumentUploadResult> {
    if (!files?.length) {
      throw new BadRequestException('At least one document is required');
    }

    if (files.length > COMPANY_PROFILE_DOCUMENTS_CONFIG.upload.maxDocuments) {
      throw new BadRequestException(
        `At most ${COMPANY_PROFILE_DOCUMENTS_CONFIG.upload.maxDocuments} documents allowed`,
      );
    }

    const extractedDocuments = await Promise.all(
      files.map((file) => this.extractDocument(file)),
    );

    // Async run documents analysis
    extractedDocuments.map((document) =>
      this.createProcessingAnalyzeAndSaveDocument(user, document),
    );

    const aiResult = await this.documentAnalysisQueue.push(() =>
      this.extractProfileWithAi(extractedDocuments),
    );

    const profile = normalizeCompanyProfileAiResult(aiResult);

    const [industries, mainServices] = await Promise.all([
      this.cpvService.resolveCpvCodeIds(profile.industries ?? [], true),
      this.cpvService.resolveCpvCodeIds(profile.mainServices ?? [], true),
    ]);

    return {
      resolvedProfile: {
        ...profile,
        industries: industries.map(({ code }) => code),
        mainServices: mainServices.map(({ code }) => code),
      },
      documents: extractedDocuments.map(({ file, extraction }, index) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        textHash: extraction.textHash,
        contentLength: extraction.contentLength,
        warnings: extraction.warnings,
      })),
    };
  }

  async buildCompanyDocumentEvidence(
    userId: string,
  ): Promise<CompanyDocumentEvidence | undefined> {
    const analyses = await CompanyProfileDocumentAnalysisModel.find({
      user: userId,
      status: CompanyProfileDocumentAnalysisStatus.DONE,
    })
      .sort({ updatedAt: -1 })
      .limit(COMPANY_PROFILE_DOCUMENTS_CONFIG.context.maxEvidenceItems)
      .lean()
      .exec();

    if (analyses.length === 0) {
      return undefined;
    }

    const documents = analyses.map((analysis) => ({
      filename: analysis.filename,
      textHash: analysis.textHash,
      documentType: analysis.documentType,
      summary: analysis.summary,
      capabilities: analysis.capabilities,
      certifications: analysis.certifications,
      industries: analysis.industries,
      technologies: analysis.technologies,
      countries: analysis.countries,
      languages: analysis.languages,
      referenceProjects: analysis.referenceProjects,
      experienceSignals: analysis.experienceSignals,
      limitations: analysis.limitations,
      confidenceScore: analysis.confidenceScore,
    }));

    return {
      summary: documents
        .map((document) => document.summary)
        .filter(Boolean)
        .join('\n'),
      capabilities: uniqueFlatMap(documents, 'capabilities'),
      certifications: uniqueFlatMap(documents, 'certifications'),
      industries: uniqueFlatMap(documents, 'industries'),
      technologies: uniqueFlatMap(documents, 'technologies'),
      countries: uniqueFlatMap(documents, 'countries'),
      languages: uniqueFlatMap(documents, 'languages'),
      referenceProjects: uniqueFlatMap(documents, 'referenceProjects'),
      experienceSignals: uniqueFlatMap(documents, 'experienceSignals'),
      limitations: uniqueFlatMap(documents, 'limitations'),
      documents,
    };
  }

  async getCompanyDocumentEvidenceSourceHash(userId: string): Promise<string> {
    const analyses = await CompanyProfileDocumentAnalysisModel.find({
      user: userId,
      status: CompanyProfileDocumentAnalysisStatus.DONE,
    })
      .select('textHash')
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    return JSON.stringify(
      analyses.map((analysis) => ({
        textHash: analysis.textHash,
      })),
    );
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
      .slice(0, COMPANY_PROFILE_DOCUMENTS_CONFIG.context.maxChars);

    return this.llmAnalysisService.createGeneralJsonResponse(
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

  private async analyzeDocument(
    user: UserDocument,
    document: {
      file: CompanyProfileDocumentFile;
      extraction: {
        aiText: string;
        textHash: string;
        contentLength: number;
        warnings: string[];
      };
    },
    processingAnalysis: CompanyProfileDocumentAnalysisDocument,
  ) {
    try {
      const response = await this.llmAnalysisService.createGeneralJsonResponse(
        COMPANY_PROFILE_SINGLE_DOCUMENT_ANALYSIS_PROMPT,
        [
          `Document: ${document.file.originalname}`,
          `MIME type: ${document.file.mimetype || 'unknown'}`,
          '',
          document.extraction.aiText.slice(
            0,
            COMPANY_PROFILE_DOCUMENTS_CONFIG.context.maxSingleDocumentChars,
          ),
        ].join('\n'),
      );

      const analysis = this.normalizeDocumentAnalysis(response);
      await this.supersedePreviousDocumentAnalyses(
        user,
        document.extraction.textHash,
        analysis.documentType,
      );

      const saved = await CompanyProfileDocumentAnalysisModel.findByIdAndUpdate(
        processingAnalysis._id,
        {
          $set: {
            ...analysis,
            status: CompanyProfileDocumentAnalysisStatus.DONE,
            errorMessage: null,
          },
        },
        { returnDocument: 'after' },
      )
        .lean()
        .exec();

      return this.serializeDocumentAnalysis(
        saved as CompanyProfileDocumentAnalysisDocument,
      );
    } catch (error: unknown) {
      const failed =
        await CompanyProfileDocumentAnalysisModel.findByIdAndUpdate(
          processingAnalysis._id,
          {
            $set: {
              status: CompanyProfileDocumentAnalysisStatus.FAILED,
              errorMessage: getSafeErrorMessage(error),
            },
          },
          { returnDocument: 'after' },
        )
          .lean()
          .exec();

      return this.serializeDocumentAnalysis(
        failed as CompanyProfileDocumentAnalysisDocument,
      );
    }
  }

  private async createProcessingAnalyzeAndSaveDocument(
    user: UserDocument,
    document: {
      file: CompanyProfileDocumentFile;
      extraction: {
        aiText: string;
        textHash: string;
        contentLength: number;
        warnings: string[];
      };
    },
  ): Promise<CompanyProfileDocumentAnalysisResult> {
    const existing = await CompanyProfileDocumentAnalysisModel.findOne({
      user: user._id,
      textHash: document.extraction.textHash,
      status: { $ne: CompanyProfileDocumentAnalysisStatus.SUPERSEDED },
    })
      .lean()
      .exec();

    if (existing) {
      return this.serializeDocumentAnalysis(existing);
    }

    const processingAnalysis =
      await CompanyProfileDocumentAnalysisModel.findOneAndUpdate(
        {
          user: user._id,
          textHash: document.extraction.textHash,
        },
        {
          $set: {
            user: user._id,
            textHash: document.extraction.textHash,
            filename: document.file.originalname,
            mimeType: document.file.mimetype,
            size: document.file.size,
            status: CompanyProfileDocumentAnalysisStatus.PROCESSING,
            promptVersion: COMPANY_PROFILE_DOCUMENT_ANALYSIS_PROMPT_VERSION,
            model: this.llmAnalysisService.getGeneralAnalysisModel(),
            errorMessage: null,
          },
        },
        { returnDocument: 'after', upsert: true },
      ).exec();

    this.documentAnalysisQueue
      .push(() => this.analyzeDocument(user, document, processingAnalysis))
      .catch((error: unknown) =>
        CompanyProfileDocumentAnalysisModel.updateOne(
          { _id: processingAnalysis._id },
          {
            $set: {
              status: CompanyProfileDocumentAnalysisStatus.FAILED,
              errorMessage: getSafeErrorMessage(error),
            },
          },
        ).exec(),
      );

    return processingAnalysis;
  }

  private normalizeDocumentAnalysis(
    value: unknown,
  ): CompanyProfileDocumentAnalysisResult {
    if (!isRecord(value)) {
      throw new BadRequestException(
        'AI document analysis returned invalid JSON',
      );
    }

    return {
      documentType:
        getEnumOrNull(value.documentType, CompanyProfileDocumentType) ??
        CompanyProfileDocumentType.OTHER,
      summary: getOptionalString(value.summary) ?? '',
      capabilities: getNormalizedStringArray(value.capabilities),
      certifications: getNormalizedStringArray(value.certifications),
      industries: getNormalizedStringArray(value.industries),
      technologies: getNormalizedStringArray(value.technologies),
      countries: getNormalizedStringArray(value.countries),
      languages: getNormalizedStringArray(value.languages),
      referenceProjects: getNormalizedStringArray(value.referenceProjects),
      experienceSignals: getNormalizedStringArray(value.experienceSignals),
      limitations: getNormalizedStringArray(value.limitations),
      confidenceScore: this.getConfidenceScore(value.confidenceScore),
    };
  }

  private serializeDocumentAnalysis(
    value: CompanyProfileDocumentAnalysisResult,
  ): CompanyProfileDocumentAnalysisResult {
    return {
      documentType: value.documentType,
      status: value.status,
      summary: value.summary,
      capabilities: value.capabilities ?? [],
      certifications: value.certifications ?? [],
      industries: value.industries ?? [],
      technologies: value.technologies ?? [],
      countries: value.countries ?? [],
      languages: value.languages ?? [],
      referenceProjects: value.referenceProjects ?? [],
      experienceSignals: value.experienceSignals ?? [],
      limitations: value.limitations ?? [],
      confidenceScore: value.confidenceScore,
      errorMessage: value.errorMessage,
    };
  }

  private async supersedePreviousDocumentAnalyses(
    user: UserDocument,
    textHash: string,
    documentType?: CompanyProfileDocumentType | null,
  ): Promise<void> {
    if (!documentType) {
      return;
    }

    await CompanyProfileDocumentAnalysisModel.updateMany(
      {
        user: user._id,
        textHash: { $ne: textHash },
        documentType,
        status: {
          $in: [
            CompanyProfileDocumentAnalysisStatus.DONE,
            CompanyProfileDocumentAnalysisStatus.FAILED,
          ],
        },
      },
      {
        $set: {
          status: CompanyProfileDocumentAnalysisStatus.SUPERSEDED,
        },
      },
    ).exec();
  }

  private getConfidenceScore(value: unknown): number | null | undefined {
    const score = getOptionalNonNegativeNumber(value);

    if (score === undefined || score === null) {
      return score;
    }

    return Math.min(100, score);
  }
}
