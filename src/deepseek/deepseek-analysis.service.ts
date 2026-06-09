import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BaseLlmAnalysisService } from '@/llm/base-llm-analysis.service';
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

@Injectable()
export class DeepSeekAnalysisService extends BaseLlmAnalysisService {
  private readonly client: OpenAI;
  private readonly generalAnalysisModel: string;
  private readonly deepAnalysisModel: string;

  constructor(private readonly configService: ConfigService) {
    super('DeepSeek', new Logger(DeepSeekAnalysisService.name));

    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'DEEPSEEK_API_KEY is not configured',
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
    this.generalAnalysisModel =
      this.configService.get<string>('DEEPSEEK_GENERAL_ANALYSIS_MODEL') ??
      'deepseek-chat';
    this.deepAnalysisModel =
      this.configService.get<string>('DEEPSEEK_DEEP_ANALYSIS_MODEL') ??
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
    const response = await this.client.chat.completions.create({
      model: this.generalAnalysisModel,
      messages: [
        {
          role: 'system',
          content: [
            'You rewrite public procurement tender titles into short, clear, user-facing titles.',
            'For each input item, preserve the id exactly.',
            'Create shortTitle translations in English, German, French, Polish, and Russian.',
            'Keep each title concise, ideally 5-10 words.',
            'Preserve the procurement subject and avoid adding facts not present in the source title.',
            'Return JSON only in this exact shape: {"items":[{"id":"...","shortTitle":{"en":"...","de":"...","fr":"...","pl":"...","ru":"..."}}]}.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({ items: input }, null, 2),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      stream: false,
    });
    const responseText = response.choices[0]?.message.content;

    if (!responseText) {
      throw new Error('DeepSeek response did not contain message content');
    }

    const parsed = JSON.parse(responseText) as unknown;

    return this.validateTenderShortTitles(parsed);
  }

  protected async createProviderJsonResponse(
    prompt: string,
    context: string,
    purpose: 'general' | 'deep',
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model:
        purpose === 'deep' ? this.deepAnalysisModel : this.generalAnalysisModel,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: context },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      stream: false,
    });
    const responseText = response.choices[0]?.message.content;

    if (!responseText) {
      throw new Error('DeepSeek response did not contain message content');
    }

    return responseText;
  }

  private validateTenderShortTitles(value: unknown): TenderShortTitleResult[] {
    if (!isRecord(value) || !Array.isArray(value.items)) {
      throw new Error('DeepSeek short title response must contain items array');
    }

    return value.items.map((item) => {
      if (!isRecord(item) || typeof item.id !== 'string') {
        throw new Error('DeepSeek short title item must contain string id');
      }

      if (!isRecord(item.shortTitle)) {
        throw new Error('DeepSeek short title item must contain shortTitle');
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
        `DeepSeek short title ${language} must be a non-empty string`,
      );
    }

    return value.trim();
  }
}
