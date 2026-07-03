import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BaseLlmAnalysisService } from './base-llm-analysis.service';
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

type LlmProvider = 'deepseek' | 'openai';

@Injectable()
export class LlmAnalysisService extends BaseLlmAnalysisService {
  private readonly client: OpenAI;
  private readonly provider: LlmProvider;
  private readonly generalAnalysisModel: string;
  private readonly deepAnalysisModel: string;

  constructor(private readonly configService: ConfigService) {
    const provider = LlmAnalysisService.resolveProvider(configService);
    const providerName = provider === 'openai' ? 'OpenAI' : 'DeepSeek';

    super(providerName, new Logger(LlmAnalysisService.name));

    this.provider = provider;
    this.client = new OpenAI({
      apiKey: this.getApiKey(provider),
      baseURL: this.getBaseUrl(provider),
    });
    this.generalAnalysisModel = this.getRequiredConfig(
      'LLM_GENERAL_ANALYSIS_MODEL',
    );
    this.deepAnalysisModel = this.getRequiredConfig('LLM_DEEP_ANALYSIS_MODEL');
  }

  private static resolveProvider(configService: ConfigService): LlmProvider {
    const provider =
      configService.get<string>('LLM_PROVIDER')?.toLowerCase() ?? 'deepseek';

    if (provider === 'deepseek' || provider === 'openai') {
      return provider;
    }

    throw new ServiceUnavailableException(
      `Unsupported LLM_PROVIDER "${provider}". Use "deepseek" or "openai".`,
    );
  }

  getProvider(): LlmProvider {
    return this.provider;
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
            'Return JSON only in this exact shape: {"items":[{"id":"...","en":"...","de":"...","fr":"...","pl":"...","ru":"..."}]}.',
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
      throw new Error(`${this.providerName} response did not contain message content`);
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
      throw new Error(`${this.providerName} response did not contain message content`);
    }

    return responseText;
  }

  private getApiKey(provider: LlmProvider): string {
    const providerPrefix = provider === 'openai' ? 'OPENAI' : 'DEEPSEEK';
    const apiKey =
      this.configService.get<string>('LLM_API_KEY') ??
      this.configService.get<string>(`${providerPrefix}_API_KEY`);

    if (!apiKey) {
      throw new ServiceUnavailableException(
        `LLM API key is not configured. Set LLM_API_KEY or ${providerPrefix}_API_KEY.`,
      );
    }

    return apiKey;
  }

  private getBaseUrl(provider: LlmProvider): string | undefined {
    const providerPrefix = provider === 'openai' ? 'OPENAI' : 'DEEPSEEK';
    const baseUrl =
      this.configService.get<string>('LLM_BASE_URL') ??
      this.configService.get<string>(`${providerPrefix}_BASE_URL`);

    if (baseUrl) {
      return baseUrl;
    }

    return provider === 'deepseek' ? 'https://api.deepseek.com' : undefined;
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new ServiceUnavailableException(`${key} is not configured`);
    }

    return value;
  }

  private validateTenderShortTitles(value: unknown): TenderShortTitleResult[] {
    if (!isRecord(value) || !Array.isArray(value.items)) {
      throw new Error(
        `${this.providerName} short title response must contain items array`,
      );
    }

    return value.items.map((item) => {
      if (!isRecord(item) || typeof item.id !== 'string') {
        throw new Error(
          `${this.providerName} short title item must contain string id`,
        );
      }

      const shortTitle = {
        en: this.requireShortTitleString(item.en, 'en'),
        de: this.requireShortTitleString(item.de, 'de'),
        fr: this.requireShortTitleString(item.fr, 'fr'),
        pl: this.requireShortTitleString(item.pl, 'pl'),
        ru: this.requireShortTitleString(item.ru, 'ru'),
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
        `${this.providerName} short title ${language} must be a non-empty string`,
      );
    }

    return value.trim();
  }
}
