import { createHash } from 'crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
  GeneralTenderAnalysisInput,
  GeneralTenderAnalysisResult,
} from './dto/openai-analysis.dto';
import { buildGeneralTenderAnalysisPrompt } from './prompts/general-tender-analysis.prompt';
import { GENERAL_TENDER_ANALYSIS_JSON_SCHEMA } from './schemas/general-tender-analysis.schema';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly client: OpenAI;
  private readonly generalAnalysisModel: string;
  private readonly retryDelaysMs = [500, 1500];
  private readonly maxDocumentChars = 40_000;
  private readonly maxContextChars = 180_000;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }

    this.client = new OpenAI({ apiKey });
    this.generalAnalysisModel =
      this.configService.get<string>('OPENAI_GENERAL_ANALYSIS_MODEL') ??
      'gpt-4.1-mini';
  }

  async analyzeTenderGeneral(
    input: GeneralTenderAnalysisInput,
  ): Promise<GeneralTenderAnalysisResult> {
    const context = this.buildTenderContext(input);
    const outputLanguage = input.outputLanguage ?? 'en';
    const prompt = buildGeneralTenderAnalysisPrompt(outputLanguage);

    const responseText = await this.createJsonResponse(prompt, context);
    const parsed = this.parseJson(responseText);

    return this.validateGeneralTenderAnalysisResult(parsed as any);
  }

  buildGeneralTenderAnalysisSourceHash(
    input: GeneralTenderAnalysisInput,
  ): string {
    console.log(
      JSON.stringify(
        {
          promptVersion: GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
          tender: input.tender,
          documents: input.documents.map((document) => ({
            id: document.id,
            filename: document.filename,
            language: document.language,
            documentType: document.documentType,
            extractedText: document.extractedText,
          })),
        },
        null,
        2,
      ),
    );
    return createHash('sha256')
      .update(
        JSON.stringify({
          promptVersion: GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
          tender: input.tender,
          documents: input.documents.map((document) => ({
            id: document.id,
            filename: document.filename,
            language: document.language,
            documentType: document.documentType,
            extractedText: document.extractedText,
          })),
        }),
      )
      .digest('hex');
  }

  getGeneralAnalysisModel(): string {
    return this.generalAnalysisModel;
  }

  private async createJsonResponse(
    prompt: string,
    context: string,
  ): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      try {
        const response = await this.client.responses.create({
          model: this.generalAnalysisModel,
          instructions: prompt,
          input: context,
          text: {
            format: {
              type: 'json_schema',
              name: 'general_tender_analysis',
              strict: true,
              schema: GENERAL_TENDER_ANALYSIS_JSON_SCHEMA,
            },
          },
        });

        if (!response.output_text) {
          throw new Error('OpenAI response did not contain output_text');
        }

        return response.output_text;
      } catch (error: unknown) {
        lastError = error;
        this.logger.warn(
          `OpenAI tender analysis failed on attempt ${attempt + 1}: ${this.getSafeErrorMessage(
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
      `OpenAI tender analysis failed: ${this.getSafeErrorMessage(lastError)}`,
    );
  }

  private buildTenderContext(input: GeneralTenderAnalysisInput): string {
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

  private parseJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error('OpenAI returned invalid JSON for tender analysis');
    }
  }

  private validateGeneralTenderAnalysisResult(
    value: GeneralTenderAnalysisResult,
  ): GeneralTenderAnalysisResult {
    if (!this.isRecord(value)) {
      throw new Error('OpenAI tender analysis result must be a JSON object');
    }

    const result: GeneralTenderAnalysisResult = {
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
      advantages: this.requireStringArray(value, 'advantages'),
      disadvantages: this.requireStringArray(value, 'disadvantages'),
      risks: this.requireRisks(value.risks),
      hiddenPitfalls: this.requireStringArray(value, 'hiddenPitfalls'),
      questionsToAsk: this.requireStringArray(value, 'questionsToAsk'),
      complexityScore: this.requireScore(value, 'complexityScore'),
      opportunityScore: this.requireScore(value, 'opportunityScore'),
      confidenceScore: this.requireScore(value, 'confidenceScore'),
      generalRecommendation: value.generalRecommendation,
      estimatedValue: value.estimatedValue,
      analysisDepth: value.analysisDepth,
      documentsAnalyzedCount: value.documentsAnalyzedCount,
      missingDocumentsWarning: value.missingDocumentsWarning,
    };

    return result;
  }

  private requireString(record: JsonRecord, key: string): string {
    const value = record[key];

    if (typeof value !== 'string') {
      throw new Error(`OpenAI analysis field ${key} must be a string`);
    }

    return value;
  }

  private requireStringArray(record: JsonRecord, key: string): string[] {
    const value = record[key];

    if (
      !Array.isArray(value) ||
      !value.every((item) => typeof item === 'string')
    ) {
      throw new Error(`OpenAI analysis field ${key} must be a string array`);
    }

    return value;
  }

  private requireScore(record: JsonRecord, key: string): number {
    const value = record[key];

    if (typeof value !== 'number' || value < 0 || value > 100) {
      throw new Error(
        `OpenAI analysis field ${key} must be a number from 0 to 100`,
      );
    }

    return value;
  }

  // private requireGoNoGo(
  //   value: unknown,
  // ): GeneralTenderAnalysisResult['generalGoNoGo'] {
  //   if (value === 'GO' || value === 'NO_GO' || value === 'REVIEW') {
  //     return value;
  //   }
  //
  //   throw new Error('OpenAI analysis field generalGoNoGo is invalid');
  // }

  private requireDeadlines(
    value: unknown,
  ): GeneralTenderAnalysisResult['deadlines'] {
    if (!Array.isArray(value)) {
      throw new Error('OpenAI analysis field deadlines must be an array');
    }

    return value.map((item) => {
      if (!this.isRecord(item)) {
        throw new Error('OpenAI analysis deadline item must be an object');
      }

      const date = item.date;

      if (date !== null && typeof date !== 'string') {
        throw new Error('OpenAI analysis deadline date must be string or null');
      }

      return {
        name: this.requireString(item, 'name'),
        date,
        description: this.requireString(item, 'description'),
      };
    });
  }

  private requireRisks(value: any): GeneralTenderAnalysisResult['risks'] {
    if (!Array.isArray(value)) {
      throw new Error('OpenAI analysis field risks must be an array');
    }

    return value.map((item) => {
      if (!this.isRecord(item)) {
        throw new Error('OpenAI analysis risk item must be an object');
      }

      const severity = item.severity;
      const mitigation = item.mitigation;

      if (severity !== 'LOW' && severity !== 'MEDIUM' && severity !== 'HIGH') {
        throw new Error('OpenAI analysis risk severity is invalid');
      }

      if (
        mitigation !== null &&
        mitigation !== undefined &&
        typeof mitigation !== 'string'
      ) {
        throw new Error(
          'OpenAI analysis risk mitigation must be string or null',
        );
      }

      return {
        type: this.requireString(item, 'type'),
        severity,
        description: this.requireString(item, 'description'),
        ...(mitigation ? { mitigation } : {}),
      };
    }) as any;
  }

  private getSafeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'unknown error';
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
