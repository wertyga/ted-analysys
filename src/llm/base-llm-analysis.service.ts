import { createHash } from 'crypto';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
  GeneralRecommendation,
  GeneralTenderAnalysisInput,
  GeneralTenderAnalysisResult,
} from '@/openai/dto/openai-analysis.dto';
import { buildGeneralTenderAnalysisPrompt } from '@/openai/prompts/general-tender-analysis.prompt';
import { GENERAL_TENDER_ANALYSIS_JSON_SCHEMA } from '@/openai/schemas/general-tender-analysis.schema';
import { getSafeErrorMessage, isRecord } from '@/utils';

type JsonRecord = Record<string, unknown>;

export abstract class BaseLlmAnalysisService {
  protected readonly retryDelaysMs = [500, 1500];
  protected readonly maxDocumentChars = 40_000;
  protected readonly maxContextChars = 180_000;

  protected constructor(
    protected readonly providerName: string,
    protected readonly logger: Logger,
  ) {}

  abstract getGeneralAnalysisModel(): string;

  protected abstract createProviderJsonResponse(
    prompt: string,
    context: string,
  ): Promise<string>;

  async analyzeTenderGeneral(
    input: GeneralTenderAnalysisInput,
  ): Promise<GeneralTenderAnalysisResult> {
    const context = this.buildTenderContext(input);
    const outputLanguage = input.outputLanguage ?? 'en';
    const prompt = this.buildGeneralTenderAnalysisPrompt(outputLanguage);
    const responseText = await this.createJsonResponse(prompt, context);
    const parsed = this.parseJson(responseText);

    return this.validateGeneralTenderAnalysisResult(parsed);
  }

  protected buildGeneralTenderAnalysisPrompt(outputLanguage: string): string {
    return [
      buildGeneralTenderAnalysisPrompt(outputLanguage),
      'Return JSON only. The JSON must match this schema:',
      JSON.stringify(GENERAL_TENDER_ANALYSIS_JSON_SCHEMA),
    ].join('\n\n');
  }

  protected async createJsonResponse(
    prompt: string,
    context: string,
  ): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      try {
        return await this.createProviderJsonResponse(prompt, context);
      } catch (error: unknown) {
        lastError = error;
        this.logger.warn(
          `${this.providerName} tender analysis failed on attempt ${attempt + 1}: ${getSafeErrorMessage(
            error,
          )}`,
        );

        if (attempt === this.retryDelaysMs.length) {
          break;
        }

        await this.delay(this.retryDelaysMs[attempt]);
      }
    }

    throw new ServiceUnavailableException(
      `${this.providerName} tender analysis failed: ${getSafeErrorMessage(
        lastError,
      )}`,
    );
  }

  protected buildTenderContext(input: GeneralTenderAnalysisInput): string {
    const documentsText = input.documents
      .map((document, index) => {
        const text = document.extractedText.slice(0, this.maxDocumentChars);

        return [
          `DOCUMENT ${index + 1}`,
          `id: ${document.id ?? 'missing'}`,
          `filename: ${document.filename ?? 'missing'}`,
          `documentType: ${document.documentType ?? 'missing'}`,
          `language: ${document.language ?? 'missing'}`,
          'extractedText:',
          text.length > 0 ? text : 'missing',
        ].join('\n');
      })
      .join('\n\n---\n\n');

    const context = [
      'TENDER STRUCTURED DATA',
      JSON.stringify(input.tender, null, 2),
      '',
      'DOCUMENTS',
      documentsText.length > 0
        ? documentsText
        : 'No extracted documents provided.',
    ].join('\n');

    return context.slice(0, this.maxContextChars);
  }

  protected parseJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error(
        `${this.providerName} returned invalid JSON for tender analysis`,
      );
    }
  }

  protected validateGeneralTenderAnalysisResult(
    value: unknown,
  ): GeneralTenderAnalysisResult {
    if (!isRecord(value)) {
      throw new Error(
        `${this.providerName} tender analysis result must be a JSON object`,
      );
    }

    return {
      summary: this.requireString(value, 'summary'),
      scopeOfWork: this.requireStringArray(value, 'scopeOfWork'),
      keyRequirements: this.requireStringArray(value, 'keyRequirements'),
      eligibilityCriteria: this.requireStringArray(
        value,
        'eligibilityCriteria',
      ),
      requiredDocuments: this.requireStringArray(value, 'requiredDocuments'),
      awardCriteria: this.requireStringArray(value, 'awardCriteria'),
      deadlines: this.requireDeadlines(value.deadlines),
      estimatedValue: this.requireEstimatedValue(value.estimatedValue),
      advantages: this.requireStringArray(value, 'advantages'),
      disadvantages: this.requireStringArray(value, 'disadvantages'),
      risks: this.requireRisks(value.risks),
      hiddenPitfalls: this.requireStringArray(value, 'hiddenPitfalls'),
      questionsToAsk: this.requireStringArray(value, 'questionsToAsk'),
      complexityScore: this.requireScore(value, 'complexityScore'),
      opportunityScore: this.requireScore(value, 'opportunityScore'),
      generalRecommendation: this.requireGeneralRecommendation(
        value.generalRecommendation,
      ),
      confidenceScore: this.requireScore(value, 'confidenceScore'),
      analysisDepth: this.requireAnalysisDepth(value.analysisDepth),
      documentsAnalyzedCount: this.requireNonNegativeInteger(
        value,
        'documentsAnalyzedCount',
      ),
      missingDocumentsWarning: this.requireBoolean(
        value,
        'missingDocumentsWarning',
      ),
    };
  }

  protected requireString(record: JsonRecord, key: string): string {
    const value = record[key];

    if (typeof value !== 'string') {
      throw new Error(
        `${this.providerName} analysis field ${key} must be a string`,
      );
    }

    return value;
  }

  protected requireStringArray(record: JsonRecord, key: string): string[] {
    const value = record[key];

    if (
      !Array.isArray(value) ||
      !value.every((item) => typeof item === 'string')
    ) {
      throw new Error(
        `${this.providerName} analysis field ${key} must be a string array`,
      );
    }

    return value;
  }

  protected requireScore(record: JsonRecord, key: string): number {
    const value = record[key];

    if (typeof value !== 'number' || value < 0 || value > 100) {
      throw new Error(
        `${this.providerName} analysis field ${key} must be a number from 0 to 100`,
      );
    }

    return value;
  }

  protected requireNonNegativeInteger(record: JsonRecord, key: string): number {
    const value = record[key];

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(
        `${this.providerName} analysis field ${key} must be a non-negative integer`,
      );
    }

    return value;
  }

  protected requireBoolean(record: JsonRecord, key: string): boolean {
    const value = record[key];

    if (typeof value !== 'boolean') {
      throw new Error(
        `${this.providerName} analysis field ${key} must be a boolean`,
      );
    }

    return value;
  }

  protected requireDeadlines(
    value: unknown,
  ): GeneralTenderAnalysisResult['deadlines'] {
    if (!Array.isArray(value)) {
      throw new Error(
        `${this.providerName} analysis field deadlines must be an array`,
      );
    }

    return value.map((item) => {
      if (!isRecord(item)) {
        throw new Error(
          `${this.providerName} analysis deadline item must be an object`,
        );
      }

      const date = item.date;

      if (date !== null && typeof date !== 'string') {
        throw new Error(
          `${this.providerName} analysis deadline date must be string or null`,
        );
      }

      return {
        name: this.requireString(item, 'name'),
        date,
        description: this.requireString(item, 'description'),
      };
    });
  }

  protected requireEstimatedValue(
    value: unknown,
  ): GeneralTenderAnalysisResult['estimatedValue'] {
    if (!isRecord(value)) {
      throw new Error(
        `${this.providerName} analysis field estimatedValue must be an object`,
      );
    }

    const amount = value.amount;
    const currency = value.currency;
    const description = value.description;
    const source = value.source;

    if (amount !== null && typeof amount !== 'number') {
      throw new Error(
        `${this.providerName} analysis estimatedValue.amount is invalid`,
      );
    }

    if (currency !== null && typeof currency !== 'string') {
      throw new Error(
        `${this.providerName} analysis estimatedValue.currency is invalid`,
      );
    }

    if (description !== null && typeof description !== 'string') {
      throw new Error(
        `${this.providerName} analysis estimatedValue.description is invalid`,
      );
    }

    if (
      source !== 'STRUCTURED_DATA' &&
      source !== 'XML_NOTICE' &&
      source !== 'DOCUMENT_TEXT' &&
      source !== 'NOT_FOUND'
    ) {
      throw new Error(
        `${this.providerName} analysis estimatedValue.source is invalid`,
      );
    }

    return { amount, currency, description, source };
  }

  protected requireRisks(value: unknown): GeneralTenderAnalysisResult['risks'] {
    if (!Array.isArray(value)) {
      throw new Error(
        `${this.providerName} analysis field risks must be an array`,
      );
    }

    return value.map((item) => {
      if (!isRecord(item)) {
        throw new Error(
          `${this.providerName} analysis risk item must be an object`,
        );
      }

      const severity = item.severity;
      const mitigation = item.mitigation;

      if (severity !== 'LOW' && severity !== 'MEDIUM' && severity !== 'HIGH') {
        throw new Error(
          `${this.providerName} analysis risk severity is invalid`,
        );
      }

      if (mitigation !== null && typeof mitigation !== 'string') {
        throw new Error(
          `${this.providerName} analysis risk mitigation must be string or null`,
        );
      }

      return {
        type: this.requireString(item, 'type'),
        severity,
        description: this.requireString(item, 'description'),
        mitigation,
      };
    });
  }

  protected requireGeneralRecommendation(
    value: unknown,
  ): GeneralRecommendation {
    if (
      value === 'PROMISING' ||
      value === 'NEEDS_REVIEW' ||
      value === 'NOT_RECOMMENDED'
    ) {
      return value;
    }

    throw new Error(
      `${this.providerName} analysis field generalRecommendation is invalid`,
    );
  }

  protected requireAnalysisDepth(
    value: unknown,
  ): GeneralTenderAnalysisResult['analysisDepth'] {
    if (
      value === 'STRUCTURED_NOTICE_ONLY' ||
      value === 'NOTICE_WITH_DOCUMENTS' ||
      value === 'FULL_DOCUMENTS'
    ) {
      return value;
    }

    throw new Error(
      `${this.providerName} analysis field analysisDepth is invalid`,
    );
  }

  protected async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
