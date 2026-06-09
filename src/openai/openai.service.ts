import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BaseLlmAnalysisService } from '@/llm/base-llm-analysis.service';
import { GENERAL_TENDER_ANALYSIS_JSON_SCHEMA } from './schemas/general-tender-analysis.schema';
import { isRecord } from '@/utils';

export interface TenderShortTitleInput {
  id: string;
  title: string;
}

export interface TenderShortTitleResult {
  id: string;
  shortTitle: {
    en: string;
    de: string;
    fr: string;
    pl: string;
    ru: string;
  };
}

const TENDER_SHORT_TITLES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'shortTitle'],
        properties: {
          id: { type: 'string' },
          shortTitle: {
            type: 'object',
            additionalProperties: false,
            required: ['en', 'de', 'fr', 'pl', 'ru'],
            properties: {
              en: { type: 'string' },
              de: { type: 'string' },
              fr: { type: 'string' },
              pl: { type: 'string' },
              ru: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

@Injectable()
export class OpenAiService extends BaseLlmAnalysisService {
  private readonly client: OpenAI;
  private readonly generalAnalysisModel: string;
  private readonly deepAnalysisModel: string;

  constructor(private readonly configService: ConfigService) {
    super('OpenAI', new Logger(OpenAiService.name));

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }

    this.client = new OpenAI({ apiKey });
    this.generalAnalysisModel =
      this.configService.get<string>('OPENAI_GENERAL_ANALYSIS_MODEL') ??
      'gpt-4.1-mini';
    this.deepAnalysisModel =
      this.configService.get<string>('OPENAI_DEEP_ANALYSIS_MODEL') ??
      this.generalAnalysisModel;
  }

  getGeneralAnalysisModel(): string {
    return this.generalAnalysisModel;
  }

  getDeepAnalysisModel(): string {
    return this.deepAnalysisModel;
  }

  async generateTenderShortTitles(
    input: TenderShortTitleInput[],
  ): Promise<TenderShortTitleResult[]> {
    const response = await this.client.responses.create({
      model: this.generalAnalysisModel,
      instructions: [
        'You rewrite public procurement tender titles into short, clear, user-facing titles.',
        'For each input item, preserve the id exactly.',
        'Create shortTitle translations in English, German, French, Polish, and Russian.',
        'Keep each title concise, ideally 5-10 words.',
        'Preserve the procurement subject and avoid adding facts not present in the source title.',
        'Return JSON only.',
      ].join('\n'),
      input: JSON.stringify({ items: input }, null, 2),
      text: {
        format: {
          type: 'json_schema',
          name: 'tender_short_titles',
          strict: true,
          schema: TENDER_SHORT_TITLES_JSON_SCHEMA,
        },
      },
    });

    if (!response.output_text) {
      throw new Error('OpenAI response did not contain output_text');
    }

    const parsed = JSON.parse(response.output_text) as unknown;

    return this.validateTenderShortTitles(parsed);
  }

  protected async createProviderJsonResponse(
    prompt: string,
    context: string,
    purpose: 'general' | 'deep',
  ): Promise<string> {
    const response = await this.client.responses.create({
      model:
        purpose === 'deep' ? this.deepAnalysisModel : this.generalAnalysisModel,
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
  }

  private validateTenderShortTitles(value: unknown): TenderShortTitleResult[] {
    if (!isRecord(value) || !Array.isArray(value.items)) {
      throw new Error('OpenAI short title response must contain items array');
    }

    return value.items.map((item) => {
      if (!isRecord(item) || typeof item.id !== 'string') {
        throw new Error('OpenAI short title item must contain string id');
      }

      if (!isRecord(item.shortTitle)) {
        throw new Error('OpenAI short title item must contain shortTitle');
      }

      const shortTitle = {
        en: this.requireShortTitleString(item.shortTitle.en, 'en'),
        de: this.requireShortTitleString(item.shortTitle.de, 'de'),
        fr: this.requireShortTitleString(item.shortTitle.fr, 'fr'),
        pl: this.requireShortTitleString(item.shortTitle.pl, 'pl'),
        ru: this.requireShortTitleString(item.shortTitle.ru, 'ru'),
      };

      return {
        id: item.id,
        shortTitle,
      };
    });
  }

  private requireShortTitleString(value: unknown, language: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(
        `OpenAI short title ${language} must be a non-empty string`,
      );
    }

    return value.trim();
  }
}
